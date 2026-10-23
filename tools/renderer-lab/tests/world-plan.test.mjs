import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkshopPlan,verifyWorkshopPlan,WORLD_ID,WORLD_QUALITY } from '../src/worldPlan.js';

for(const family of ['assemble','planar']){
  test('Atlas Workshop '+family+' preserves gameplay corridors in every tier',()=>{
    let previous=0;
    for(const quality of ['low','medium','high']){
      const plan=buildWorkshopPlan(quality,family);
      assert.equal(plan.id,WORLD_ID);
      assert.equal(verifyWorkshopPlan(plan),true);
      assert.ok(plan.props.length>=previous);
      assert.ok(plan.props.length<=WORLD_QUALITY[quality].maxProps);
      assert.ok(plan.props.every(p=>p.interactive===false));
      previous=plan.props.length;
    }
  });
}
test('Atlas Workshop shares geometry layout between Assemble and Planar',()=>{
  for(const quality of ['low','medium','high']){
    const a=buildWorkshopPlan(quality,'assemble');
    const b=buildWorkshopPlan(quality,'planar');
    assert.deepEqual(a.props,b.props);
    assert.notStrictEqual(a.props,b.props);
  }
});
test('Atlas Workshop rejects unknown variants and intrusion into board',()=>{
  assert.throws(()=>buildWorkshopPlan('ultra','assemble'),RangeError);
  assert.throws(()=>buildWorkshopPlan('low','planar-cube'),RangeError);
  const plan=buildWorkshopPlan('low','planar');
  plan.props.push({...plan.props[0],id:'intrusion',x:0,y:1,z:0,sx:1,sy:1,sz:1,underBoard:false});
  assert.throws(()=>verifyWorkshopPlan(plan),/intrudes/);
});
