import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const provided = process.env.VOLTWISE_PLAYWRIGHT_MODULE ?? 'playwright';
const { chromium } = await import(isAbsolute(provided) ? pathToFileURL(provided).href : provided);
const url = process.env.VOLTWISE_SMOKE_URL ?? 'http://127.0.0.1:4174/';
const output = resolve('artifacts/results');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless:true, ...(process.env.VOLTWISE_CHROME_PATH ? { executablePath:process.env.VOLTWISE_CHROME_PATH } : { channel:'chrome' }) });
const errors=[], consoleErrors=[], failedResponses=[], externalRequests=[], cases=[];
async function makePage(width, { quantity='300', priority='LOWEST_SCENARIO_COST', e='NO', d='NO', dual=null, unknown=false }={}) {
  const context=await browser.newContext({viewport:{width,height:820},isMobile:true,hasTouch:true});
  const page=await context.newPage(); page.setDefaultTimeout(8000);
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
  page.on('response',r=>{if(r.status()>=400)failedResponses.push({url:r.url(),status:r.status()});});
  page.on('request',r=>{if(new URL(r.url()).origin!==new URL(url).origin)externalRequests.push(r.url());});
  await page.goto(url); await page.getByRole('button',{name:'Ας ξεκινήσουμε'}).click();
  const choose=async name=>page.getByRole('radio',{name,exact:true}).locator('..').click();
  const next=()=>page.getByRole('button',{name:'Συνέχεια',exact:true}).click();
  await choose('Έχω συμβόλαιο'); await next(); await choose('Έχω στοιχεία λογαριασμού');
  await choose(dual ? 'Διζωνική μέτρηση' : unknown ? 'Δεν γνωρίζω' : 'Μονή μέτρηση');
  if(dual){await choose('Ναι, έχω χωριστές kWh'); await page.getByLabel('Κανονική ζώνη (kWh)',{exact:true}).fill(dual[0]); await page.getByLabel('Μειωμένη ζώνη (kWh)',{exact:true}).fill(dual[1]);}
  else await page.getByLabel('Συνολική κατανάλωση (kWh)',{exact:true}).fill(quantity);
  await page.getByRole('button',{name:'30 ημέρες',exact:true}).click(); await next();
  for(const [name,value] of [['priority',priority],['e_bill',e],['direct_debit',d]])await page.locator(`input[name="${name}"][value="${value}"]`).locator('..').click();
  await next(); await page.getByRole('button',{name:'Δες τη σύγκριση'}).click();
  await page.getByRole('heading',{name:'Αποτελέσματα demo',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Τι αλλάζει αν…'}).count(),1);
  await fits(page); return page;
}
async function fits(page){assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal overflow');}
async function featuredDetail(page,id){await page.locator(`[data-featured-id="${id}"] button`).click();}
async function assertTotal(page,energy,fee,total){
  assert.equal((await page.getByTestId('energy-total').innerText()).replaceAll('\u00a0',' '),energy);
  assert.equal((await page.getByTestId('fixed-fee').innerText()).replaceAll('\u00a0',' '),fee);
  assert.equal((await page.getByTestId('breakdown-total').innerText()).replaceAll('\u00a0',' '),total);
}
try {
  {
    const page=await makePage(360);
    assert.equal(await page.getByTestId('first-programs').getAttribute('data-program-ids'),'B1');
    assert.equal(await page.locator('[data-featured-id]').count(),2);
    assert.equal(await page.locator('[data-featured-id="B1"] [data-amount-cents]').getAttribute('data-amount-cents'),'4300');
    await page.screenshot({path:resolve(output,'results-360.png'),fullPage:true});
    await featuredDetail(page,'B1'); await assertTotal(page,'39,00 €','4,00 €','43,00 €');
    assert((await page.getByTestId('baseline-text').innerText()).includes('Δεν έχει οριστεί ακριβές'));
    assert((await page.locator('.price-caution').innerText()).includes('Δεν γνωρίζουμε την επόμενη τιμή'));
    await fits(page); await page.screenshot({path:resolve(output,'details-360.png'),fullPage:true});
    await page.getByRole('button',{name:'Πίσω στα αποτελέσματα'}).click();
    assert.equal(await page.evaluate(()=>document.activeElement?.id),'featured-details-B1');
    await page.getByRole('button',{name:'Δες όλα τα 4 προγράμματα'}).click();
    await page.getByRole('button',{name:'Σύγκριση δύο προγραμμάτων',exact:true}).click();
    assert.equal(await page.locator('#pair-0').inputValue(),'B1'); assert.equal(await page.locator('#pair-1').inputValue(),'A2');
    assert((await page.getByTestId('pair-difference').innerText()).includes('3,00 €'));
    assert((await page.getByTestId('pair-intersection').innerText()).includes('600,00'));
    await page.locator('#pair-0').selectOption('A1');
    assert((await page.getByTestId('pair-intersection').innerText()).includes('200,00'));
    assert((await page.locator('.pair-facts .inline-note').innerText()).includes('δεν είναι αλλαγή του συνολικά'));
    await fits(page); await page.screenshot({path:resolve(output,'comparison-360.png'),fullPage:true});
    await page.locator('#pair-details-A2').click(); await assertTotal(page,'36,00 €','10,00 €','46,00 €');
    await page.getByRole('button',{name:'Πίσω στη σύγκριση'}).click();
    assert.equal(await page.locator('#pair-0').inputValue(),'A1'); assert.equal(await page.locator('#pair-1').inputValue(),'A2');
    await page.getByRole('button',{name:'Πίσω στα αποτελέσματα'}).click(); assert.equal(await page.locator('.ranking-list > li').count(),4);
    cases.push({case:'cost-details-compare-third-offer-return-state',width:360,passed:true}); await page.context().close();
  }
  {
    const page=await makePage(320,{e:'YES',d:'YES'});
    assert.equal(await page.locator('[data-featured-id]').count(),1);
    assert.equal(await page.locator('[data-featured-id="C1"]').count(),1);
    assert.equal(await page.locator('[data-featured-id="C1"] .tag').count(),3);
    await featuredDetail(page,'C1'); await assertTotal(page,'30,00 €','3,00 €','33,00 €');
    assert((await page.getByTestId('discount-status').innerText()).includes('εφαρμόστηκε'));
    assert((await page.locator('.condition-list').last().innerText()).includes('24,00 €'));
    await fits(page); await page.screenshot({path:resolve(output,'discount-details-320.png'),fullPage:true});
    await page.getByRole('button',{name:'Σύγκρινε με άλλο πρόγραμμα'}).click(); await fits(page);
    assert((await page.getByTestId('pair-difference').innerText()).includes('10,00 €'));
    cases.push({case:'one-discovery-two-categories-full-discount',width:320,passed:true}); await page.context().close();
  }
  {
    const page=await makePage(390,{priority:'FIXED_RATE'});
    assert.equal(await page.getByTestId('first-programs').getAttribute('data-program-ids'),'A2');
    assert((await page.locator('[data-featured-id="B1"] .outside-preference').innerText()).includes('εκτός'));
    await page.getByRole('button',{name:'Σύγκριση δύο προγραμμάτων',exact:true}).click();
    assert.equal(await page.locator('#pair-0').inputValue(),'A2'); assert.equal(await page.locator('#pair-1').inputValue(),'B1');
    assert((await page.locator('.comparison-intro').innerText()).includes('Προβλεψιμότητα χρέωσης ενέργειας'));
    assert((await page.getByTestId('pair-difference').innerText()).includes('3,00 €'));
    await page.getByRole('button',{name:'Πίσω στα αποτελέσματα'}).click();
    assert.equal(await page.getByTestId('first-programs').getAttribute('data-program-ids'),'A2');
    await featuredDetail(page,'A2'); assert((await page.locator('.price-caution').innerText()).includes('Δεν σημαίνει σταθερό τελικό λογαριασμό'));
    await fits(page); cases.push({case:'fixed-priority-cheaper-variable-alternative',width:390,passed:true}); await page.context().close();
  }
  for(const [quantity,priority,first,count] of [['600','LOWEST_SCENARIO_COST','A2,B1',2],['200','FIXED_RATE','A1,A2',3]]) {
    const page=await makePage(360,{quantity,priority});
    assert.equal(await page.getByTestId('first-programs').getAttribute('data-program-ids'),first);
    assert.equal(await page.locator('[data-featured-id]').count(),count);
    assert.equal(await page.locator('[data-featured-id="A2"]').count(),1);
    assert((await page.locator('[data-featured-id="A2"] .why-block').innerText()).includes('Ισοβαθμεί'));
    await fits(page); cases.push({case:quantity==='600'?'overlapping-category-tie':'fixed-category-tie',width:360,passed:true}); await page.context().close();
  }
  {
    const page=await makePage(390,{dual:['0.03','0.07']});
    await page.getByRole('button',{name:'Δες όλα τα 5 προγράμματα'}).click();
    await page.locator('#rank-details-D1').click();
    await assertTotal(page,'0,01 €','6,00 €','6,01 €');
    assert((await page.getByTestId('rounding-adjustment').innerText()).includes('−0,01 €'));
    await fits(page); cases.push({case:'dual-breakdown-rounding',width:390,passed:true}); await page.context().close();
  }
  {
    const page=await makePage(320,{unknown:true,e:'YES',d:'UNKNOWN'});
    await page.getByRole('button',{name:'Δες όλα τα 4 προγράμματα'}).click(); await page.locator('#rank-details-C1').click();
    await assertTotal(page,'54,00 €','3,00 €','57,00 €');
    assert((await page.getByTestId('discount-status').innerText()).includes('άγνωστος όρος'));
    await page.getByRole('button',{name:'Πίσω στα αποτελέσματα'}).click();
    await page.locator('.excluded-programs > summary').click(); await page.locator('#excluded-details-D1').click();
    assert.equal(await page.locator('[data-amount-cents]').count(),0);
    assert((await page.locator('.no-amount').innerText()).includes('Δεν υπολογίζεται'));
    assert(await page.getByRole('button',{name:'Σύγκρινε με άλλο πρόγραμμα'}).isDisabled());
    await fits(page); cases.push({case:'unknown-condition-and-incompatible-offer-no-fake-amount',width:320,passed:true}); await page.context().close();
  }
  {
    const page=await makePage(360);
    const trigger=page.locator('#featured-details-B1'); await trigger.focus(); await page.keyboard.press('Enter');
    await page.getByRole('heading',{name:'Στιγμιότυπο',exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>document.activeElement?.tagName),'H1');
    await page.getByRole('button',{name:'Πίσω στα αποτελέσματα'}).focus(); await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(()=>document.activeElement?.id),'featured-details-B1');
    await page.locator('#open-comparison').focus(); await page.keyboard.press('Enter');
    await page.getByRole('heading',{name:'Σύγκριση δύο προγραμμάτων',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Τι αλλάζει αν…'}).count(),1);
    cases.push({case:'keyboard-and-focus-restoration',width:360,passed:true}); await page.context().close();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);assert.deepEqual(failedResponses,[]);assert.deepEqual(externalRequests,[]);
  const report={cases,errors,consoleErrors,failedResponses,externalRequests};
  await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2)); console.log(JSON.stringify(report));
} finally {await browser.close();}
