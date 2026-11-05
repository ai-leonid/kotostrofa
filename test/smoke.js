'use strict';
const path = require('path');
const CANNON = require(path.join(__dirname, '..', 'vendor', 'cannon.min.js'));
const THREE = require(path.join(__dirname, '..', 'vendor', 'three.min.js'));

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('PASS  ' + name);
  else { failures++; console.log('FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}

// --- three r147 surface ---
check('three REVISION', typeof THREE.REVISION === 'string', THREE.REVISION);
check('three BoxGeometry', typeof THREE.BoxGeometry === 'function');
check('three SphereGeometry', typeof THREE.SphereGeometry === 'function');
check('three CylinderGeometry', typeof THREE.CylinderGeometry === 'function');
check('three ConeGeometry', typeof THREE.ConeGeometry === 'function');
check('three sRGBEncoding', THREE.sRGBEncoding !== undefined);
check('three PCFSoftShadowMap', THREE.PCFSoftShadowMap !== undefined);
check('three HemisphereLight', typeof THREE.HemisphereLight === 'function');

// --- cannon basics ---
const world = new CANNON.World();
world.gravity.set(0, -9.82, 0);
world.broadphase = new CANNON.SAPBroadphase(world);

const matA = new CANNON.Material('a');
const matB = new CANNON.Material('b');
world.addContactMaterial(new CANNON.ContactMaterial(matA, matB, { friction: 0.4, restitution: 0.3 }));

const ground = new CANNON.Body({ mass: 0, material: matA });
ground.addShape(new CANNON.Box(new CANNON.Vec3(10, 0.5, 10)));
ground.position.set(0, -0.5, 0);
world.addBody(ground);

const box = new CANNON.Body({ mass: 1, material: matB });
box.addShape(new CANNON.Box(new CANNON.Vec3(0.1, 0.1, 0.1)));
box.position.set(0, 2, 0);
world.addBody(box);

for (let i = 0; i < 180; i++) world.step(1 / 60);
check('box fell and rests on ground', Math.abs(box.position.y - 0.1) < 0.05, 'y=' + box.position.y.toFixed(3));

// --- cylinder axis orientation ---
const cyl = new CANNON.Cylinder(0.1, 0.1, 0.6, 8);
let maxY = 0, maxZ = 0;
for (const v of cyl.vertices) { maxY = Math.max(maxY, Math.abs(v.y)); maxZ = Math.max(maxZ, Math.abs(v.z)); }
check('cylinder axis is Z by default', maxZ > maxY * 2, 'maxY=' + maxY.toFixed(3) + ' maxZ=' + maxZ.toFixed(3));

// reorient to Y via transformAllPoints
const cylY = new CANNON.Cylinder(0.1, 0.1, 0.6, 8);
const q = new CANNON.Quaternion();
q.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), Math.PI / 2);
cylY.transformAllPoints(new CANNON.Vec3(0, 0, 0), q);
let mY = 0, mZ = 0;
for (const v of cylY.vertices) { mY = Math.max(mY, Math.abs(v.y)); mZ = Math.max(mZ, Math.abs(v.z)); }
check('transformAllPoints reorients cylinder to Y', mY > mZ * 2, 'mY=' + mY.toFixed(3) + ' mZ=' + mZ.toFixed(3));

// --- collide event + impact velocity ---
let maxImpact = null;
var box2 = new CANNON.Body({ mass: 0.5, material: matB });
box2.addShape(new CANNON.Box(new CANNON.Vec3(0.1, 0.1, 0.1)));
box2.position.set(5, 3, 0);
world.addBody(box2);
box2.addEventListener('collide', function (e) {
  if (e.contact && typeof e.contact.getImpactVelocityAlongNormal === 'function') {
    const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
    if (maxImpact === null || v > maxImpact) maxImpact = v;
  } else {
    maxImpact = -1;
  }
});
for (let i = 0; i < 300; i++) world.step(1 / 60);
check('collide event fired', maxImpact !== null, 'impact=' + maxImpact);
check('impact velocity sane (fall from 3m)', maxImpact > 4 && maxImpact < 30, 'impact=' + maxImpact);

// --- world.contacts structure ---
let contactShapeOk = false;
for (const c of world.contacts) {
  if (c.ni && c.bi && c.bj) contactShapeOk = true;
}
check('world.contacts has ni/bi/bj', contactShapeOk);

// --- Ray / RaycastResult ---
let rayOk = false;
try {
  const ray = new CANNON.Ray(new CANNON.Vec3(0, 5, 0), new CANNON.Vec3(0, -5, 0));
  const result = new CANNON.RaycastResult();
  ray.intersectWorld(world, { mode: CANNON.Ray.CLOSEST, result: result, skipBackfaces: true });
  rayOk = result.hasHit === true;
} catch (err) { rayOk = 'error: ' + err.message; }
check('Ray.intersectWorld + RaycastResult', rayOk === true, '' + rayOk);

// --- sleep API ---
let sleepOk = false;
try {
  box2.allowSleep = true;
  box2.sleepSpeedLimit = 0.3;
  box2.sleepTimeLimit = 0.2;
  box2.sleep();
  sleepOk = box2.sleepState === CANNON.Body.SLEEPING;
  box2.wakeUp();
} catch (err) { sleepOk = 'error: ' + err.message; }
check('body.sleep()/SLEEPING', sleepOk === true, '' + sleepOk);

// --- fixed rotation ---
const cr = new CANNON.Body({ mass: 1 });
cr.addShape(new CANNON.Sphere(0.2));
cr.fixedRotation = true;
cr.updateMassProperties();
check('fixedRotation supported', cr.fixedRotation === true);

// --- applyImpulse signature ---
let impOk = false;
try {
  box2.applyImpulse(new CANNON.Vec3(0.1, 0, 0), new CANNON.Vec3(0, 0, 0));
  impOk = true;
} catch (err) { impOk = err.message; }
check('applyImpulse(impulse, point)', impOk === true, '' + impOk);

console.log(failures === 0 ? '\nALL OK' : '\n' + failures + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);
