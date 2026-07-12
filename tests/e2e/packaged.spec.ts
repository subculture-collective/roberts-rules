import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect,test,type BrowserContext } from '@playwright/test';

interface Fixture{meetingId:string;meetingUrl:string;enrollments:Record<'chair'|'observer',string>}
const execute=promisify(execFile);let fixture:Fixture;const contexts:BrowserContext[]=[];
const environment={...process.env,STAGING_ENV:process.env.STAGING_ENV??'deploy/staging.env',FIXTURE_CONFIRMATION:process.env.FIXTURE_CONFIRMATION??'packaged-test-only'};
async function make(args:string[]){return execute('make',args,{cwd:process.cwd(),env:environment});}

test.beforeEach(async()=>{const {stdout}=await make(['pilot-fixture']);fixture=JSON.parse(stdout.trim().split('\n').at(-1)!) as Fixture;});
test.afterEach(async()=>{await Promise.all(contexts.splice(0).map((context)=>context.close()));await make(['pilot-fixture-cleanup',`MEETING_ID=${fixture.meetingId}`]);});

test('serves an authenticated multi-client meeting through the packaged proxy',async({browser})=>{
  const chairContext=await browser.newContext();const observerContext=await browser.newContext();contexts.push(chairContext,observerContext);
  const chair=await chairContext.newPage();const observer=await observerContext.newPage();
  for(const [page,token] of [[chair,fixture.enrollments.chair],[observer,fixture.enrollments.observer]] as const){await page.goto(fixture.meetingUrl);await page.getByLabel('Enrollment token').fill(token);await page.getByRole('button',{name:'Enter meeting'}).click();await expect(page.getByRole('heading',{name:'Meeting in open'})).toBeVisible();}
  await expect(observer.getByRole('button',{name:'Recess'})).toHaveCount(0);
  await chair.getByRole('button',{name:'Recess'}).click();
  await expect(observer.getByRole('heading',{name:'Meeting in recessed'})).toBeVisible();
  await observer.reload();await expect(observer.getByRole('heading',{name:'Meeting in recessed'})).toBeVisible();
  expect(await observer.evaluate(()=>({local:{...localStorage},session:{...sessionStorage}}))).toEqual({local:{},session:{}});
});
