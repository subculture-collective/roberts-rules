import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect,test,type Browser,type BrowserContext,type Page } from '@playwright/test';

interface Fixture {
  meetingId:string;
  meetingUrl:string;
  enrollments:Record<'chair'|'secretary'|'delegate'|'observer',string>;
}

const execute=promisify(execFile);
const contexts:BrowserContext[]=[];
const remoteHost=process.env.STAGING_REMOTE_HOST;
const remotePath=process.env.STAGING_REMOTE_PATH??'/srv/server/projects/roberts-rules-staging';
const environment={...process.env,STAGING_ENV:process.env.STAGING_ENV??'deploy/staging.env',FIXTURE_CONFIRMATION:process.env.FIXTURE_CONFIRMATION??'packaged-test-only'};
let fixture:Fixture|undefined;

function shellQuote(value:string):string{return `'${value.replaceAll("'",`'\\''`)}'`;}

async function fixtureCommand(target:'pilot-fixture'|'pilot-fixture-cleanup',meetingId?:string):Promise<string>{
  try {
    if(remoteHost){
      if(!/^[A-Za-z0-9_.@-]+$/.test(remoteHost))throw new Error('invalid remote fixture host');
      const assignment=meetingId?` MEETING_ID=${shellQuote(meetingId)}`:'';
      const command=`cd ${shellQuote(remotePath)} && make --no-print-directory ${target}${assignment}`;
      return (await execute('ssh',[remoteHost,command],{env:environment})).stdout;
    }
    const args=[target];if(meetingId)args.push(`MEETING_ID=${meetingId}`);
    return (await execute('make',args,{cwd:process.cwd(),env:environment})).stdout;
  } catch(error) {
    // Child stdout can contain raw enrollment credentials, so never attach it to failures.
    const detail=error instanceof Error?error.message.split('\n')[0]:'unknown child-process failure';
    throw new Error(`${target} failed: ${detail}`);
  }
}

test.beforeEach(async()=>{
  const stdout=await fixtureCommand('pilot-fixture');
  const document=stdout.trim().split('\n').at(-1);
  if(!document)throw new Error('fixture command returned no JSON document');
  try{fixture=JSON.parse(document) as Fixture;}catch{throw new Error('fixture command returned invalid JSON');}
});

test.afterEach(async()=>{
  await Promise.all(contexts.splice(0).map((context)=>context.close()));
  if(fixture)await fixtureCommand('pilot-fixture-cleanup',fixture.meetingId);
  fixture=undefined;
});

async function enter(browser:Browser,role:keyof Fixture['enrollments'],errors:string[]):Promise<Page>{
  if(!fixture)throw new Error('fixture is unavailable');
  const context=await browser.newContext();contexts.push(context);
  const page=await context.newPage();
  page.on('console',(message)=>{if(message.type()==='error')errors.push(message.text());});
  page.on('pageerror',(error)=>errors.push(error.message));
  await page.goto(fixture.meetingUrl);
  await page.getByLabel('Enrollment token').fill(fixture.enrollments[role]);
  await page.getByRole('button',{name:'Enter meeting'}).click();
  await expect(page.getByRole('heading',{name:'Meeting in open'})).toBeVisible();
  return page;
}

test('serves an authenticated multi-client meeting through the public staging route',async({browser})=>{
  if(!fixture)throw new Error('fixture is unavailable');
  const errors:string[]=[];
  const chair=await enter(browser,'chair',errors);
  const delegate=await enter(browser,'delegate',errors);
  const observer=await enter(browser,'observer',errors);

  await expect(observer.getByRole('button',{name:'Recess'})).toHaveCount(0);
  await delegate.getByRole('button',{name:'Join pro queue'}).click();
  await expect(observer.getByRole('listitem').filter({hasText:'delegate-1'})).toBeVisible();
  await chair.getByRole('button',{name:'Recess'}).click();
  await expect(delegate.getByRole('heading',{name:'Meeting in recessed'})).toBeVisible();
  await expect(observer.getByRole('heading',{name:'Meeting in recessed'})).toBeVisible();
  await observer.reload();
  await expect(observer.getByRole('heading',{name:'Meeting in recessed'})).toBeVisible();

  for(const page of [chair,delegate,observer]){
    expect(Object.values(fixture.enrollments).some((token)=>page.url().includes(token))).toBe(false);
    expect(await page.evaluate(()=>({local:{...localStorage},session:{...sessionStorage}}))).toEqual({local:{},session:{}});
    const dimensions=await page.evaluate(()=>({viewport:document.documentElement.clientWidth,content:document.documentElement.scrollWidth}));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
  }
  for(const token of Object.values(fixture.enrollments))expect(errors.join('\n')).not.toContain(token);
  const unexpectedErrors=errors.filter((message)=>
    !/^Failed to load resource: the server responded with a status of 401/.test(message),
  );
  expect(unexpectedErrors).toEqual([]);
});
