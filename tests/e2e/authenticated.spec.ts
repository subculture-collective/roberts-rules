import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const databaseUrl=process.env.E2E_DATABASE_URL??'postgres://roberts_rules:change-me@127.0.0.1:55433/roberts_rules?sslmode=disable';
const origin='http://127.0.0.1:4173';
// Enrollment values are credentials. Never persist browser artifacts from this suite.
test.use({trace:'off',screenshot:'off',video:'off'});
let fixture:DevFixture;
const contexts:BrowserContext[]=[];
interface DevFixture{meetingId:string;meetingUrl:string;enrollments:Record<'chair'|'secretary'|'delegate'|'observer',string>}
const execute=promisify(execFile);
const fixtureEnv={...process.env,DATABASE_URL:databaseUrl,CONFIRM_DEV_FIXTURE:'local-only',DEV_WEB_ORIGIN:origin};
async function createFixture():Promise<DevFixture>{const {stdout}=await execute('pnpm',['--silent','--filter','@subculture/roberts-rules-api','dev:fixture'],{cwd:process.cwd(),env:fixtureEnv});return JSON.parse(stdout.trim().split('\n').at(-1)!) as DevFixture;}
async function cleanupFixture(meetingId:string):Promise<void>{await execute('pnpm',['--silent','--filter','@subculture/roberts-rules-api','dev:fixture:cleanup',meetingId],{cwd:process.cwd(),env:fixtureEnv});}

test.beforeEach(async()=>{fixture=await createFixture();});
test.afterEach(async()=>{await Promise.all(contexts.splice(0).map((context)=>context.close()));await cleanupFixture(fixture.meetingId);});

async function enter(browser:Browser,role:keyof DevFixture['enrollments']):Promise<Page>{const context=await browser.newContext();contexts.push(context);const page=await context.newPage();await page.goto(fixture.meetingUrl);await page.getByLabel('Enrollment token').fill(fixture.enrollments[role]!);await page.getByRole('button',{name:'Enter meeting'}).click();await expect(page.getByRole('heading',{name:'Meeting in open'})).toBeVisible();return page;}

test('rejects an invalid enrollment, restores a valid session on reload, and keeps the token ephemeral',async({page})=>{await page.goto(fixture.meetingUrl);await page.getByLabel('Enrollment token').fill('invalid-enrollment-token-long-enough');await page.getByRole('button',{name:'Enter meeting'}).click();await expect(page.getByText('Enrollment token is invalid or expired.')).toBeVisible();const token=fixture.enrollments.chair!;await page.getByLabel('Enrollment token').fill(token);await page.getByRole('button',{name:'Enter meeting'}).click();await expect(page.getByRole('button',{name:'Recess'})).toBeVisible();expect(page.url()).not.toContain(token);expect(await page.evaluate(()=>({local:{...localStorage},session:{...sessionStorage}}))).toEqual({local:{},session:{}});await page.reload();await expect(page.getByRole('button',{name:'Recess'})).toBeVisible();});

test('enforces role controls and publishes commands to every connected projection',async({browser,browserName},testInfo)=>{test.skip(testInfo.project.name==='mobile-safari','multi-context synchronization runs in desktop browsers');test.skip(browserName==='webkit'&&process.env.CI==='true','covered by WebKit authenticated restoration; multi-context timing is exercised in Chromium and Firefox');const chair=await enter(browser,'chair');const delegate=await enter(browser,'delegate');const observer=await enter(browser,'observer');await expect(observer.getByRole('button',{name:'Recess'})).toHaveCount(0);await delegate.getByRole('button',{name:'Join pro queue'}).click();await expect(observer.getByRole('listitem').filter({hasText:'delegate-1'})).toBeVisible();await chair.getByRole('button',{name:'Recess'}).click();await expect(delegate.getByRole('heading',{name:'Meeting in recessed'})).toBeVisible();await expect(observer.getByRole('heading',{name:'Meeting in recessed'})).toBeVisible();});

test('catches up after an offline interval and revokes the session on logout',async({browser,browserName})=>{test.skip(browserName!=='chromium','reconnect transport scenario runs once in Chromium');const chair=await enter(browser,'chair');const observer=await enter(browser,'observer');const observerContext=observer.context();await observerContext.setOffline(true);await chair.getByRole('button',{name:'Recess'}).click();await expect(chair.getByRole('heading',{name:'Meeting in recessed'})).toBeVisible();await observerContext.setOffline(false);await expect(observer.getByRole('heading',{name:'Meeting in recessed'})).toBeVisible({timeout:15_000});await observer.getByRole('button',{name:'Log out'}).click();await expect(observer.getByLabel('Enrollment token')).toBeVisible();await observer.reload();await expect(observer.getByLabel('Enrollment token')).toBeVisible();});

test('renders the authenticated live floor without browser errors or horizontal overflow',async({browser})=>{const page=await enter(browser,'observer');const errors:string[]=[];page.on('console',(message)=>{if(message.type()==='error')errors.push(message.text());});page.on('pageerror',(error)=>errors.push(error.message));const dimensions=await page.evaluate(()=>({viewport:document.documentElement.clientWidth,content:document.documentElement.scrollWidth}));expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);expect(errors).toEqual([]);});
