import test from 'node:test';
import assert from 'node:assert/strict';
import {gearIdentity} from '../app/src/main/assets/www/gear-art.mjs';

test('model artwork identifies individual drives and delay types without a DOM',()=>{
  assert.equal(gearIdentity('EFX',5).label,'T SCREAM');
  assert.equal(gearIdentity('EFX',6).label,'BLUES DRV');
  assert.notEqual(gearIdentity('EFX',5).color,gearIdentity('EFX',6).color);
  assert.equal(new Set([1,2,3,4,5,6,7,8].map(id=>gearIdentity('DLY',id).color)).size,8);
  assert.equal(gearIdentity('AMP',9).label,'CLASS A30');
  assert.deepEqual(gearIdentity('unknown',99),{color:'#8194a5',label:'unknown',knobs:3});
});
