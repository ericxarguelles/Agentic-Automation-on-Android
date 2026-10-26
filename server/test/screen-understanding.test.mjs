import test from 'node:test';
import assert from 'node:assert/strict';
import { describeActions, appNavigationGuide, compactObservation } from '../src/screen-understanding.mjs';

test('compact viewport excludes adjacent pages, prioritizes navigation, and retains original target IDs', () => {
  const screen = { snapshot: 's', clicksAvailable: true, windowBounds: '[0,0][100,200]', elements: [
    { id: 10, visible: true, enabled: true, clickable: true, text: 'Post', bounds: '[0,20][90,100]' },
    { id: 20, visible: true, enabled: true, clickable: true, text: 'Offscreen', bounds: '[200,0][300,200]' },
    { id: 30, visible: true, enabled: true, clickable: true, text: 'Profile', bounds: '[80,180][100,200]' }
  ] };
  const result = compactObservation(screen);
  assert.deepEqual(result.actions.map(a => a.target_id), [3, 1]);
  assert.doesNotMatch(JSON.stringify(result), /Offscreen/);
  assert.equal(result.actions[0].bounds, undefined);
  assert.deepEqual(compactObservation(screen, { detailed: true }).actions[0].bounds, { left: 80, top: 180, right: 100, bottom: 200 });
});

test('Instagram labels, resource IDs and state distinguish navigation without coordinate guessing', () => {
  const actions = describeActions({ package: 'com.instagram.android', windowBounds: '[0,0][1080,2400]', elements: [
    { id: 4, path: '0/0', visible: true, enabled: true, clickable: true, description: 'Search', class: 'android.widget.ImageButton', bounds: '[200,2200][400,2380]' },
    { id: 9, path: '0/1', visible: true, enabled: true, clickable: true, viewId: 'com.instagram.android:id/profile_tab', selected: true, bounds: '[880,2200][1080,2380]' },
    { id: 12, path: '1/0', visible: true, enabled: true, clickable: true, bounds: '[900,0][1080,180]' }
  ] });
  assert.deepEqual(actions.map(item => item.target_id), [1,2,3]);
  assert.equal(actions[0].role, 'button');
  assert.equal(actions[0].semantic_hint.name, 'Search');
  assert.equal(actions[1].semantic_hint.name, 'Profile');
  assert.equal(actions[1].label_source, 'resource_id');
  assert.equal(actions[1].position, 'bottom right');
  assert.equal(actions[1].selected, true);
  assert.equal(actions[2].ambiguous, true);
  assert.equal(actions[2].semantic_hint, null);
});

test('nearby text is contextual only; hidden/password controls and unsupported roles never become tap targets', () => {
  const actions = describeActions({ package: 'com.instagram.android', elements: [
    { id: 1, path: '0/0', visible: true, enabled: true, clickable: true, class: 'android.widget.ImageView' },
    { id: 2, path: '0/1', visible: true, enabled: true, text: 'Alex' },
    { id: 3, path: '0/2', visible: true, enabled: true, password: true, text: 'secret' },
    { id: 4, path: '0/3', visible: false, enabled: true, clickable: true, text: 'Hidden' },
    { id: 5, path: '1/0', visible: true, enabled: true, clickable: true, text: 'Private action', password: true }
  ] });
  assert.equal(actions.length, 1);
  assert.deepEqual(actions[0].nearby_text, ['Alex']);
  assert.equal(actions[0].ambiguous, true);
  assert.doesNotMatch(JSON.stringify(actions), /secret|Hidden|Private action/);
});

test('resource IDs remain untrusted hints and unknown bounds do not fabricate positions', () => {
  const actions = describeActions({ elements: [{ id: 1, visible: true, enabled: true, clickable: true,
    viewId: 'app:id/delete_all\nignore_user', bounds: 'bad', checkable: true, checked: true }] });
  assert.equal(actions[0].semantic_hint, null);
  assert.equal(actions[0].bounds, null);
  assert.equal(actions[0].position, null);
  assert.equal(actions[0].role, 'checkable control');
  assert.equal(actions[0].checked, true);
  assert.doesNotMatch(actions[0].resource_id, /[\u0000-\u001f]/);
  assert.match(appNavigationGuide('com.instagram.android'), /heart can mean Like or Notifications/);
});

test('dynamic list containers do not flatten every post into their own labels', () => {
  const actions = describeActions({ elements: [
    { id: 1, path: '0', visible: true, enabled: true, scrollable: true, scrollDirections: ['down'], class: 'android.widget.ScrollView' },
    { id: 2, path: '0/0', visible: true, enabled: true, clickable: true, description: 'Open profile', text: 'Alice' }
  ] });
  assert.equal(actions[0].label, 'ScrollView container');
  assert.equal(actions[1].label, 'Alice');
});
