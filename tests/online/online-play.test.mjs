// Run with node --test tests/online/online-play.test.mjs (no dependencies,
// no network). Online Play, whole: Home's Online play (the third of the
// first row, a square the size of Settings with its globe, green while it
// can open, red and described while offline, live), the online name
// (every time, remembered, checked, Suggest a name for a controller), "Online
// play is unavailable right now" with no server, the lobby (Create room and
// its dialog, public or private, Join with code, the public list, "Servers
// are full", a code nobody has, a full room), the room (its code and Copy
// code, both seats, the fighter, the peer link, Ready, the host's start, the
// drawn stage), the online battle (each player on their own side by name,
// no pause: a menu with Leave match while the world runs on, the forfeit,
// "Waiting for opponent…" then "Connection lost", the result from this
// player's side, Rematch, Leave room), the host closing the room, a peer
// link that fails, and going offline. Real screens, input, navigation and
// Battle on a fake DOM, against the real room server's code in process
// (tests/helpers/online-app.mjs) and a headless other player.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TEST_A, TEST_B, useTestFighters } from '../fighters/fixtures/test-fighters.mjs';
import { stylesheet } from '../helpers/stylesheet.mjs';
import { boot, backend, peerHub, otherPlayer, otherSide, settle, settleAll, current } from '../helpers/online-app.mjs';

const { CONFIG } = await import('../../js/config.js');
const { Settings } = await import('../../js/core/settings.js');
const { setLanguage, localizeTree } = await import('../../js/localization/i18n.js');
const { ICONS } = await import('../../js/ui/icons.js');
const { stageForSeed } = await import('../../js/online/match-setup.js');

useTestFighters(TEST_A, TEST_B);

const text = (node) => node.textContent.replace(/\s+/g, ' ').trim();
const dialogOpen = (app) => !!app.dialog.resolve;
const dialogText = (app) => `${app.dialog.title.textContent} — ${app.dialog.message.textContent}`;
const acknowledge = async (app) => {
  app.dialog.okBtn.click();
  await settleAll();
};

// From Home to the lobby as `name`.
async function toLobby(booted, name = 'Chris') {
  const { app, screens } = booted;
  screens.home.actions.online.click();
  assert.equal(current(app), 'online-name');
  screens.name.field.input.type_(name);
  screens.name.continueButton.click();
  await settleAll();
  assert.equal(current(app), 'online-lobby');
}

// The host's UI creates a room (public unless said); the other player joins
// it by code; both peers connect.
async function roomWithGuest(booted, { visibility = 'public', guestName = 'Sam' } = {}) {
  const { app, screens, server, hub } = booted;
  await toLobby(booted);
  screens.lobby.createButton.click();
  await settle();
  const dialog = app.createRoomDialog;
  assert.equal(dialog.isOpen, true);
  if (visibility === 'private') dialog.visibilityButtons[1].click();
  dialog.createButton.click();
  await settleAll();
  assert.equal(current(app), 'online-room');
  const guest = otherPlayer(server, hub, { name: guestName });
  await guest.session.joinRoom({ code: app.online.room.code });
  await settleAll(10);
  return guest;
}

// Both pick, both ready: the match starts and the UI enters the battle.
async function startMatch(booted, guest) {
  const { app, screens } = booted;
  app.selection.online.characterId = TEST_A.id;
  screens.room.fighterButton.click();
  assert.equal(current(app), 'online-character');
  screens.fighter.confirm(TEST_A);
  assert.equal(current(app), 'online-room');
  guest.session.pickFighter(TEST_B.id);
  guest.session.setReady(true);
  await settleAll();
  assert.equal(screens.room.readyButton.disabled, false, 'Ready opens once a fighter is chosen and the peer link is up');
  screens.room.readyButton.click();
  await settleAll(10);
  await new Promise((r) => setTimeout(r, 5));
  await settleAll();
  assert.equal(current(app), 'online-battle');
  const start = guest.session.start;
  assert.ok(start, 'the guest has the same start');
  return otherSide(guest, start);
}

// ---- Home ---------------------------------------------------------------------------

test('Home: Online play is the first row\'s third, a square globe after Local play, named and in the menu', () => {
  const { app, screens } = boot();
  const home = screens.home;
  const { play, local, online } = home.actions;
  const row = home.el.querySelector('.home-actions-row');
  assert.deepEqual(row.children.map((c) => c === play || c.contains(play) ? 'play' : c.contains(local) ? 'local' : c.contains(online) ? 'online' : '?'), ['play', 'local', 'online']);
  assert.ok(online.classNames.has('home-action') && online.classNames.has('home-action--online'));
  assert.equal(online.html, ICONS.globe, 'the globe icon, no text and no emoji');
  assert.match(ICONS.globe, /<circle[^>]*r="8\.5"/);
  assert.equal((ICONS.globe.match(/<path/g) ?? []).length, 3, 'an equator and two meridians');
  assert.equal(online.getAttribute('aria-label'), 'Online play');
  assert.equal(online.getAttribute('title'), 'Online play');
  assert.equal(online.getAttribute('data-home-action'), 'online');
  assert.ok(online.hasAttribute('data-nav'));
  assert.deepEqual(Object.keys(home.actions), ['play', 'local', 'online', 'watch', 'practice', 'discover']);
  assert.ok(app.nav.candidates(home.el).includes(online), 'keyboard and controllers reach it');
  assert.equal(document.activeElement, play, 'Play stays the default');
  setLanguage('fr');
  try {
    localizeTree(home.el);
    assert.equal(online.getAttribute('aria-label'), 'Jeu en ligne');
    assert.equal(online.getAttribute('title'), 'Jeu en ligne');
  } finally {
    setLanguage('en');
    localizeTree(home.el);
  }
});

test('Home: open and glowing green while online; offline it is disabled, says why and glows red; it follows the connection live', () => {
  const { app, screens, connectivity } = boot();
  const home = screens.home;
  const online = home.actions.online;
  const state = () => [online.disabled, online.classNames.has('is-ready'), online.classNames.has('is-offline')];
  assert.deepEqual(state(), [false, true, false], 'online: open, green');
  assert.equal(online.hasAttribute('aria-describedby'), false);
  assert.equal(home.onlineCell.getAttribute('title'), null);
  connectivity.set(false);
  assert.deepEqual(state(), [true, false, true], 'offline: closed, red');
  assert.equal(online.getAttribute('aria-describedby'), 'home-online-note');
  assert.equal(home.onlineNote.textContent, "You're offline. Connect to the internet to play online.");
  assert.equal(home.onlineCell.getAttribute('title'), "You're offline. Connect to the internet to play online.");
  assert.ok(home.onlineCell.classNames.has('is-disabled'), 'its cell takes the pointer, for the tooltip');
  assert.ok(!app.nav.candidates(home.el).includes(online), 'out of the menu while closed');
  online.disabled = false;
  online.click();
  assert.equal(current(app), 'home', 'a stale press goes nowhere offline');
  connectivity.set(true);
  assert.deepEqual(state(), [false, true, false], 'back online: open again at once');
  assert.equal(home.onlineCell.getAttribute('title'), null);
  setLanguage('fr');
  try {
    connectivity.set(false);
    localizeTree(home.el);
    assert.equal(home.onlineCell.getAttribute('title'), 'Vous êtes hors ligne. Connectez-vous à Internet pour jouer en ligne.');
  } finally {
    setLanguage('en');
  }
});

test('the stylesheet: the square is the Settings button\'s size at every size, green like Local play, red on its own token, still with reduced motion', () => {
  const css = stylesheet();
  assert.match(css, /\.screen--home \{[^}]*--home-utility-size: clamp\(40px, 7vh, 48px\);/s);
  assert.match(css, /\.home-utility-buttons > button, \.home-download \{[^}]*width: var\(--home-utility-size\);[^}]*height: var\(--home-utility-size\);/s);
  assert.match(css, /\.home-action\.home-action--online \{[^}]*width: var\(--home-utility-size\);[^}]*height: var\(--home-utility-size\);/s);
  // Nothing anywhere sizes either one differently (the menu's own heights
  // on short screens never reach the square: two classes).
  for (const [selectors, body] of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const sel = selectors.trim();
    if (!/home-settings|home-utility-buttons > button|home-action--online/.test(sel)) continue;
    for (const prop of ['width', 'height']) {
      const value = body.match(new RegExp(`(?:^|;)\\s*${prop}:\\s*([^;]+)`))?.[1]?.trim();
      if (value) assert.equal(value, 'var(--home-utility-size)', `${sel}: ${prop}`);
    }
  }
  assert.match(css, /\.home-actions-row \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\) var\(--home-utility-size\);/s);
  // The first row's height counts in the menu's height allowance.
  assert.match(css, /max\(clamp\(42px, 7\.4vh, 58px\), var\(--home-utility-size\)\)/);
  assert.match(css, /max\(36px, var\(--home-utility-size\)\)/);
  // Green: Local play's edge, glow and cadence.
  assert.match(css, /\.home-action--online\.is-ready \{ border-color: rgba\(47, 191, 99, 0\.6\); \}/);
  assert.match(css, /\.home-action--online\.is-ready::after,\n\.home-action--online\.is-offline::after \{[^}]*border: 1px solid rgba\(47, 191, 99, 0\.6\);[^}]*box-shadow: 0 0 10px 1px rgba\(47, 191, 99, 0\.32\);[^}]*animation: home-download-glow 3\.2s ease-in-out infinite;/s);
  // Red: the same shape and cadence on the danger token, defined once.
  assert.match(css, /--danger-edge: rgba\(255, 90, 79, 0\.6\);/);
  assert.match(css, /\.home-action--online\.is-offline::after \{ border-color: var\(--danger-edge\); box-shadow: 0 0 10px 1px var\(--danger-glow\); \}/);
  assert.match(css, /\.home-action--online\.is-offline:disabled \{ border-color: var\(--danger-edge\); \}/);
  assert.equal((css.match(/255, 90, 79/g) ?? []).length, 3, 'the red written once per token');
  assert.match(css, /\.screen--home\[inert\] \.home-action--online::after \{ animation-play-state: paused; \}/);
  assert.match(css, /prefers-reduced-motion: reduce\) \{[^]*\.home-action--online\.is-ready::after, \.home-action--online\.is-offline::after \{ animation: none; opacity: 0\.5; \}/);
});

// ---- The name -----------------------------------------------------------------------

test('the online name: asked every time, checked, remembered, offered again; a controller confirms it without typing', async () => {
  const settings = new Settings(null);
  const booted = boot({ settings });
  const { app, screens } = booted;
  screens.home.actions.online.click();
  const name = screens.name;
  assert.equal(text(name.el.querySelector('.online-lede')), 'Choose a name other players will see.');
  assert.equal(name.field.input.value, '', 'nothing remembered yet');
  assert.equal(document.activeElement, name.field.input, 'the field first');
  for (const [typed, message] of [['', 'Enter a name.'], ['x', 'Use at least 2 characters.'], ['x'.repeat(17), 'Use at most 16 characters.'],
    ['<b>me</b>', "Use only letters, digits, spaces and _ - . '"], ['Neo😎', "Use only letters, digits, spaces and _ - . '"]]) {
    name.field.input.type_(typed);
    name.continueButton.click();
    await settleAll();
    assert.equal(current(app), 'online-name', typed);
    assert.equal(name.field.error.textContent, message, typed);
    assert.equal(name.field.input.getAttribute('aria-invalid'), 'true');
  }
  name.field.input.type_('  Zoë   d’Arc ');
  assert.equal(name.field.error.textContent, '', 'typing clears the error');
  name.continueButton.click();
  await settleAll();
  assert.equal(current(app), 'online-lobby');
  assert.equal(settings.onlineName, "Zoë d'Arc", 'cleaned and remembered');
  assert.equal(app.online.name, "Zoë d'Arc");
  assert.equal(text(screens.lobby.playingAs), "Playing as Zoë d'Arc");
  // Next time it is offered, and Continue is one press away.
  app.screens.go('home', {}, { reset: true });
  screens.home.actions.online.click();
  assert.equal(name.field.input.value, "Zoë d'Arc");
  assert.equal(document.activeElement, name.continueButton, 'a remembered name: Continue focused');
  booted.app.nav.padCommand('confirm');
  await settleAll();
  assert.equal(current(app), 'online-lobby', 'a controller confirms it');
  // Suggest a name, for whoever would rather not type.
  app.screens.back();
  name.field.input.type_('');
  name.suggestButton.click();
  assert.match(name.field.input.value, /^Player \d{4}$/);
  assert.equal(document.activeElement, name.continueButton);
});

test('typing in a field: letters, Space and Backspace are the field\'s, never a menu command; Esc still goes back', () => {
  const { app, screens, key } = boot();
  screens.home.actions.online.click();
  const input = screens.name.field.input;
  // The screen as it is laid out: the field, then its two buttons under it.
  input.rect = { left: 100, top: 200, width: 400, height: 44 };
  screens.name.suggestButton.rect = { left: 100, top: 300, width: 190, height: 44 };
  screens.name.continueButton.rect = { left: 310, top: 300, width: 190, height: 44 };
  input.focus();
  for (const code of ['KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyJ', 'KeyK', 'Space', 'Backspace', 'ArrowLeft', 'ArrowRight']) {
    key(code);
    assert.equal(document.activeElement, input, `${code} stays in the field`);
    assert.equal(current(app), 'online-name', code);
  }
  key('ArrowDown');
  assert.notEqual(document.activeElement, input, '↓ moves on');
  input.focus();
  key('Escape');
  assert.equal(current(app), 'home', 'Esc goes back');
});

test('no room server configured (CONFIG.online.serverUrl empty): after the name, "Online play is unavailable right now", then Home', async () => {
  const booted = boot({ serverUrl: '' });
  const { app, screens } = booted;
  screens.home.actions.online.click();
  screens.name.field.input.type_('Chris');
  screens.name.continueButton.click();
  await settleAll();
  assert.equal(dialogOpen(app), true);
  assert.equal(dialogText(app), 'Online play unavailable — Online play is unavailable right now. This copy of the game has no room server set up.');
  assert.equal(app.dialog.cancelBtn.hidden, true, 'one button to acknowledge');
  await acknowledge(app);
  assert.equal(current(app), 'home');
});

test('a server that cannot be reached is "unavailable" too, never "full"', async () => {
  const server = backend();
  const broken = { ...server, fetchImpl: () => Promise.reject(new TypeError('network')) };
  const { app, screens } = boot({ server: broken });
  screens.home.actions.online.click();
  screens.name.field.input.type_('Chris');
  screens.name.continueButton.click();
  await settleAll();
  assert.equal(dialogText(app), "Online play unavailable — Online play is unavailable right now. The room server can't be reached from here: it may be down, or blocked on this network.");
  await acknowledge(app);
  assert.equal(current(app), 'home');
});

test('a server that refuses this page\'s address says so, naming the address it saw', async () => {
  const server = backend({ ALLOWED_ORIGINS: 'https://html.itch.zone' }, { origin: 'https://html-classic.itch.zone' });
  const { app, screens } = boot({ server });
  screens.home.actions.online.click();
  screens.name.field.input.type_('Chris');
  screens.name.continueButton.click();
  await settleAll(10);
  assert.equal(dialogText(app), "Online play unavailable — Online play is unavailable right now. The room server doesn't accept this page's address (https://html-classic.itch.zone).");
  setLanguage('fr');
  try {
    await acknowledge(app);
    screens.home.actions.online.click();
    screens.name.continueButton.click();
    await settleAll(10);
    assert.equal(app.dialog.message.textContent, "Le jeu en ligne est indisponible pour le moment. Le serveur de salles n’accepte pas l’adresse de cette page (https://html-classic.itch.zone).");
  } finally {
    setLanguage('en');
  }
});

test('a server whose rooms fail says the server answers but its rooms do not, and logs it', async () => {
  const server = backend();
  server.env.LOBBY = { idFromName: () => 'lobby', get: () => ({ fetch: () => Promise.reject(new Error('storage down')) }) };
  const { app, screens } = boot({ server });
  const error = console.error;
  console.error = () => {};
  try {
    screens.home.actions.online.click();
    screens.name.field.input.type_('Chris');
    screens.name.continueButton.click();
    await settleAll(10);
  } finally {
    console.error = error;
  }
  assert.equal(dialogText(app), 'Online play unavailable — Online play is unavailable right now. The room server answers, but its rooms are not working right now.');
});

// ---- The lobby ----------------------------------------------------------------------

test('the lobby: Create room (its dialog: the name to start from, Public or Private, the one mode), into the room', async () => {
  const booted = boot();
  const { app, screens } = booted;
  await toLobby(booted, 'Chris');
  assert.equal(text(screens.lobby.listStatus), 'No public rooms right now. Create one!');
  screens.lobby.createButton.click();
  await settle();
  const dialog = app.createRoomDialog;
  assert.equal(dialog.field.input.value, "Chris's room");
  assert.deepEqual(dialog.visibilityButtons.map((b) => b.getAttribute('aria-checked')), ['true', 'false'], 'Public by default');
  assert.deepEqual(dialog.modeButtons.map((b) => [b.getAttribute('data-mode'), b.getAttribute('aria-checked'), text(b)]), [['quick-battle', 'true', 'Quick battle']],
    'Quick Battle, the one mode, shown as a choice of one');
  dialog.field.input.type_('x');
  dialog.createButton.click();
  assert.equal(dialog.field.error.textContent, 'Use at least 2 characters.');
  dialog.field.input.type_('r'.repeat(25));
  dialog.createButton.click();
  assert.equal(dialog.field.error.textContent, 'Use at most 24 characters.');
  dialog.field.input.type_('Friday   fights');
  dialog.visibilityButtons[1].click();
  dialog.createButton.click();
  await settleAll(10);
  assert.equal(current(app), 'online-room');
  const room = screens.room;
  assert.equal(room.title.textContent, 'Friday fights');
  assert.match(room.codeValue.value, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/);
  assert.equal(text(room.visibilityChip), 'Private');
  assert.equal(text(room.modeChip), 'Quick battle');
  assert.equal(text(room.stageLine), 'Stage: drawn at random when the match starts');
  assert.equal(text(room.statusLine), 'Share the room code with a friend, or wait for someone to join.');
  assert.equal(text(room.seats.host.root.querySelector('.online-seat-name')), 'Chris');
  assert.equal(room.seats.host.root.querySelector('.online-mark--you').hidden, false, 'You');
  assert.equal(text(room.seats.guest.root.querySelector('.online-seat-name')), 'Waiting for a player to join…');
  assert.equal(room.readyButton.disabled, true, 'nobody to play yet');
  // French: "Salle de {name}".
  app.screens.backTo('online-lobby');
  app.online.leaveRoom();
  setLanguage('fr');
  try {
    screens.lobby.createButton.click();
    await settle();
    assert.equal(dialog.field.input.value, 'Salle de Chris');
    dialog.close(null);
  } finally {
    setLanguage('en');
  }
});

test('Join with code: any case, a malformed code said at once, a code nobody has, a full room', async () => {
  const booted = boot();
  const { app, screens, server, hub } = booted;
  const host = otherPlayer(server, hub, { name: 'Ana' });
  await host.session.createRoom({ name: "Ana's room", visibility: 'private', mode: 'quick-battle' });
  await toLobby(booted, 'Chris');
  assert.equal(text(screens.lobby.listStatus), 'No public rooms right now. Create one!', 'a private room is never listed');
  const code = screens.lobby.code;
  code.input.type_('ab0');
  screens.lobby.joinButton.click();
  await settleAll();
  assert.equal(code.error.textContent, 'A room code is 5 letters and digits.');
  assert.equal(dialogOpen(app), false);
  code.input.type_('zzzzz');
  assert.equal(code.input.value, 'ZZZZZ', 'shown in capitals');
  screens.lobby.joinButton.click();
  await settleAll();
  assert.equal(dialogText(app), 'Room not found — No room has that code any more. Check it and try again.');
  await acknowledge(app);
  assert.equal(current(app), 'online-lobby', 'the lobby stays');
  code.input.type_(host.session.room.code.toLowerCase());
  screens.lobby.joinButton.click();
  await settleAll(10);
  assert.equal(current(app), 'online-room');
  assert.equal(app.online.seat, 'guest');
  assert.equal(text(screens.room.seats.host.root.querySelector('.online-seat-name')), 'Ana');
  assert.equal(screens.room.seats.host.root.querySelector('.online-mark').hidden, false, 'the host is marked');
  // A third player finds it full.
  const third = otherPlayer(server, hub, { name: 'Lee' });
  await assert.rejects(third.session.joinRoom({ code: host.session.room.code }), (err) => err.code === 'room_full');
});

test('the public list: rooms by name, host, mode and players, Join for an open one; full or in-match ones shown, not joinable; refreshed', async () => {
  const booted = boot();
  const { app, screens, server, hub } = booted;
  const a = otherPlayer(server, hub, { name: 'Ana' });
  await a.session.createRoom({ name: 'Open room', visibility: 'public', mode: 'quick-battle' });
  server.clock.now += 1000;
  const b = otherPlayer(server, hub, { name: 'Bea' });
  await b.session.createRoom({ name: 'Busy room', visibility: 'public', mode: 'quick-battle' });
  const c = otherPlayer(server, hub, { name: 'Cal' });
  await c.session.joinRoom({ code: b.session.room.code });
  await toLobby(booted, 'Chris');
  await settleAll();
  const rows = screens.lobby.list.children;
  assert.deepEqual(rows.map((r) => text(r.querySelector('.online-room-name'))), ['Busy room', 'Open room']);
  const [busy, open] = rows;
  assert.equal(text(open.querySelector('.online-room-host')), 'Host: Ana');
  assert.equal(text(open.querySelector('.online-room-mode')), 'Quick battle');
  assert.equal(text(open.querySelector('.online-room-players')), '1/2 players');
  const join = open.querySelector('.online-room-join');
  assert.equal(join.disabled, false);
  assert.equal(join.getAttribute('aria-label'), 'Join Open room');
  assert.equal(busy.querySelector('.online-room-join').disabled, true);
  assert.equal(text(busy.querySelector('.online-room-join')), 'Full');
  assert.equal(text(busy.querySelector('.online-room-players')), '2/2 players');
  // A refresh picks up a new room.
  const d = otherPlayer(server, hub, { name: 'Dee' });
  await d.session.createRoom({ name: 'New room', visibility: 'public', mode: 'quick-battle' });
  await screens.lobby.refresh();
  assert.equal(screens.lobby.list.children.length, 3);
  assert.equal(CONFIG.online.listRefreshMs, 5000);
  assert.ok(screens.lobby.timer, 'the next read is scheduled');
  join.click();
  await settleAll(10);
  assert.equal(current(app), 'online-room');
  assert.equal(app.online.room.name, 'Open room');
  app.screens.go('home', {}, { reset: true });
  assert.equal(screens.lobby.timer, null, 'no list read once the lobby is gone');
});

test('"Servers are full": a room more than the server allows is refused with its own message, and the lobby stays', async () => {
  const server = backend({ MAX_ROOMS: '1' });
  const booted = boot({ server });
  const { app, screens, hub } = booted;
  const other = otherPlayer(server, hub, { name: 'Ana' });
  await other.session.createRoom({ name: 'The one room', visibility: 'private', mode: 'quick-battle' });
  await toLobby(booted);
  screens.lobby.createButton.click();
  await settle();
  app.createRoomDialog.createButton.click();
  await settleAll(10);
  assert.equal(dialogText(app), 'Servers are full — Servers are full right now. Please try again in a few minutes.');
  await acknowledge(app);
  assert.equal(current(app), 'online-lobby');
});

// ---- The room and the match ---------------------------------------------------------

test('the room: the guest arrives, both browsers connect, fighters and Ready; the host\'s browser starts; the drawn stage; the battle', async () => {
  const booted = boot();
  const { app, screens } = booted;
  const guest = await roomWithGuest(booted);
  const room = screens.room;
  assert.equal(text(room.seats.guest.root.querySelector('.online-seat-name')), 'Sam');
  assert.equal(room.seats.guest.root.querySelector('.online-mark--you').hidden, true);
  assert.equal(app.online.peer.status, 'open', 'the peer link is up');
  assert.equal(guest.session.peer.status, 'open');
  assert.equal(text(room.statusLine), 'Choose your fighter, then press Ready.');
  assert.equal(room.readyButton.disabled, true, 'Ready waits for a fighter');
  const other = await startMatch(booted, guest);
  // Both get the same start: the seed, the fighters, the names.
  const start = app.online.start;
  assert.deepEqual(start, guest.session.start);
  assert.equal(start.p1.name, 'Chris');
  assert.equal(start.p2.name, 'Sam');
  assert.equal(start.p1.fighterId, TEST_A.id);
  assert.equal(start.p2.fighterId, TEST_B.id);
  const battle = screens.battle;
  assert.equal(battle.battle.mode, 'online');
  assert.equal(battle.battle.map.id, stageForSeed(start.seed).id, 'the stage drawn from the host\'s seed');
  assert.equal(battle.battle.map.id, other.battle.map.id, 'the same on both sides');
  assert.equal(battle.revealName.textContent, `${battle.battle.map.name}`, 'the drawn stage shows over the intro');
  assert.equal(battle.localSlot, 'p1', 'the host plays p1');
  assert.equal(battle.battle.p1.label, 'Chris');
  assert.equal(battle.battle.p2.label, 'Sam');
  assert.equal(battle.hud.left.tag.textContent, 'Chris', 'the HUD names the players');
  assert.equal(battle.hud.right.tag.textContent, 'Sam');
  assert.deepEqual(battle.battle.markerColors, CONFIG.online.colors);
  assert.ok(battle.el.classNames.has('is-online'));
  assert.equal(battle.touchRoot.hidden, false, 'touch controls for the local player');
  for (let i = 0; i < 240; i++) booted.frame(other);
  assert.ok(battle.lockstep.next > 200, `the match runs (${battle.lockstep.next} steps)`);
  assert.ok(Math.abs(battle.lockstep.next - other.lockstep.next) <= 4);
  assert.equal(battle.battle.phase, 'fight');
  assert.equal(battle.reveal.hidden, true, 'the stage name gone once the fight starts');
});

test('no pause online: Esc opens a menu with only Leave match, the world goes on; leaving is a forfeit the other side hears', async () => {
  const booted = boot();
  const { app, screens, key } = booted;
  const guest = await roomWithGuest(booted);
  const other = await startMatch(booted, guest);
  const battle = screens.battle;
  for (let i = 0; i < 150; i++) booted.frame(other);
  key('Escape');
  assert.equal(battle.menuOpen, true);
  assert.equal(battle.paused, false, 'never paused');
  assert.equal(battle.pauseOverlay.hidden, true, 'not the pause menu');
  assert.deepEqual(battle.menuOverlay.querySelectorAll('.pause-btn-item').map(text), ['Leave match']);
  assert.equal(battle.lockstep.muted, true, 'the player plays nothing meanwhile');
  const before = battle.lockstep.next;
  for (let i = 0; i < 30; i++) booted.frame(other);
  assert.ok(battle.lockstep.next > before + 20, 'the world runs on under the menu');
  // The HUD's pause and the controller's Start do the same.
  key('Escape');
  assert.equal(battle.menuOpen, false);
  battle.hud.pauseButton.click();
  assert.equal(battle.menuOpen, true);
  battle.menuOverlay.querySelector('.pause-btn-item').click();
  await settleAll();
  assert.equal(current(app), 'online-room', 'the leaver is back in the room');
  for (let i = 0; i < 5; i++) booted.frame(other);
  assert.deepEqual(other.ends, ['left'], '"Your opponent left." on the other side');
  assert.equal(guest.session.room.status, 'full', 'the room is a room again');
});

test('the other player leaving mid-match: "Your opponent left." (a win), then back to the room', async () => {
  const booted = boot();
  const { app, screens } = booted;
  const guest = await roomWithGuest(booted);
  const other = await startMatch(booted, guest);
  for (let i = 0; i < 150; i++) booted.frame(other);
  other.lockstep.leave();
  booted.frame(other);
  await settleAll();
  assert.equal(dialogText(app), 'Opponent left — Your opponent left. The match counts as a win for you.');
  const final = screens.battle.battle?.final;
  assert.equal(final?.winner, 'p1');
  assert.equal(final?.reason, 'forfeit');
  await acknowledge(app);
  assert.equal(current(app), 'online-room');
});

test('an opponent who stops answering: "Waiting for opponent…", then "Connection lost" after the grace, back to the room', async () => {
  const booted = boot();
  const { app, screens, hub } = booted;
  let now = 0;
  screens.battle.lockstepClock = () => now;
  const guest = await roomWithGuest(booted);
  const other = await startMatch(booted, guest);
  for (let i = 0; i < 120; i++) {
    now += 1000 / 60;
    booted.frame(other);
  }
  hub.pair.hold = true;
  const battle = screens.battle;
  for (let i = 0; i < 40; i++) {
    now += 1000 / 60;
    booted.frame(null);
  }
  assert.equal(battle.waitingNote.hidden, false);
  assert.equal(text(battle.waitingNote), 'Waiting for opponent…');
  now += CONFIG.online.disconnectGraceMs;
  booted.frame(null);
  await settleAll();
  assert.equal(dialogText(app), 'Connection lost — Your opponent stopped responding.');
  assert.equal(battle.waitingNote.hidden, true);
  await acknowledge(app);
  assert.equal(current(app), 'online-room');
});

test('the match\'s end: from this player\'s side, then Rematch (both accept, a new start) or Leave room', async () => {
  const booted = boot();
  const { app, screens } = booted;
  const guest = await roomWithGuest(booted);
  const other = await startMatch(booted, guest);
  const battle = screens.battle;
  for (let i = 0; i < 150; i++) booted.frame(other);
  battle.battle.finishMatch({ outcome: 'p1', reason: 'void' });
  booted.frame(other);
  assert.equal(battle.bannerState, 'victory', 'VICTORY! for the winner\'s own browser');
  assert.equal(text(battle.toastText), 'You win!');
  battle.openResults();
  assert.deepEqual(battle.resultsActions.map(text), ['Rematch', 'Leave room']);
  assert.deepEqual(battle.resultsLine.children.map(text), ['Chris — WINNER', 'Sam — DEFEATED']);
  assert.equal(text(battle.resultsTeams.p2.name), 'Sam');
  battle.rematchButton.click();
  await settleAll();
  assert.equal(text(battle.rematchStatus), 'Waiting for your opponent to accept…');
  assert.equal(battle.rematchButton.disabled, true);
  const first = app.online.start.match;
  guest.session.requestRematch();
  await settleAll(10);
  assert.equal(app.online.start.match, first + 1, 'a new match');
  assert.equal(current(app), 'online-battle');
  assert.equal(battle.setup.match, first + 1);
  assert.equal(battle.battle.matchOver, false, 'a fresh match');
  // Leave room from the results: back to the lobby, the room closes for the
  // guest (the host left).
  const other2 = otherSide(guest, guest.session.start);
  for (let i = 0; i < 30; i++) booted.frame(other2);
  battle.battle.finishMatch({ outcome: 'p2', reason: 'void' });
  booted.frame(other2);
  assert.equal(battle.bannerState, 'defeat');
  assert.equal(text(battle.toastText), 'Sam wins!');
  battle.openResults();
  battle.leaveRoomButton.click();
  await settleAll(10);
  assert.equal(current(app), 'online-lobby');
  assert.ok(guest.events.some(([type, d]) => type === 'closed' && d.reason === 'host_left'));
});

test('the host closing the room: the guest is told "The host closed the room." and goes back to the lobby', async () => {
  const booted = boot();
  const { app, screens, server, hub } = booted;
  const host = otherPlayer(server, hub, { name: 'Ana' });
  await host.session.createRoom({ name: "Ana's room", visibility: 'public', mode: 'quick-battle' });
  await toLobby(booted);
  await settleAll();
  screens.lobby.list.children[0].querySelector('.online-room-join').click();
  await settleAll(10);
  assert.equal(current(app), 'online-room');
  host.session.leaveRoom();
  await settleAll(10);
  assert.equal(dialogText(app), 'Room closed — The host closed the room.');
  await acknowledge(app);
  assert.equal(current(app), 'online-lobby');
  assert.equal(app.online.inRoom, false);
});

test('leaving the room asks first; the host is told it closes the room for both', async () => {
  const booted = boot();
  const { app, screens } = booted;
  const guest = await roomWithGuest(booted);
  screens.room.leaveButton.click();
  assert.equal(dialogText(app), 'Leave the room? — You are the host: leaving closes the room for both players.');
  app.dialog.cancelBtn.click();
  await settleAll();
  assert.equal(current(app), 'online-room', 'Stay');
  screens.room.leaveButton.click();
  app.dialog.okBtn.click();
  await settleAll(10);
  assert.equal(current(app), 'online-lobby');
  assert.ok(guest.events.some(([type, d]) => type === 'closed' && d.reason === 'host_left'));
});

test('a peer link that cannot be made: "Couldn\'t connect to your opponent…", Ready closed, Try again offered', async () => {
  const hub = peerHub();
  hub.fail = true;
  const booted = boot({ hub });
  const { app, screens } = booted;
  await roomWithGuest(booted);
  await settleAll();
  assert.equal(app.online.peer.status, 'failed');
  assert.equal(dialogText(app), "Couldn't connect — Couldn't connect to your opponent. One of your networks may be blocking it.");
  await acknowledge(app);
  assert.equal(text(screens.room.statusLine), "Couldn't connect to your opponent.");
  assert.equal(screens.room.retryButton.hidden, false);
  assert.equal(screens.room.readyButton.disabled, true);
  hub.fail = false;
  screens.room.retryButton.click();
  await settleAll(10);
  assert.equal(app.online.peer.status, 'open', 'connected on the second try');
});

test('going offline anywhere in Online Play: "Connection lost", back to Home, the room left', async () => {
  const booted = boot();
  const { app, connectivity } = booted;
  const guest = await roomWithGuest(booted);
  connectivity.set(false);
  await settleAll(10);
  assert.equal(current(app), 'home');
  assert.equal(dialogText(app), "Connection lost — You're offline, so the connection was lost.");
  assert.equal(app.online.inRoom, false);
  assert.ok(guest.events.some(([type, d]) => type === 'closed' && d.reason === 'host_left'));
});

test('Copy code: the clipboard where allowed, else the code selected for the player to copy (itch.io\'s frame)', async () => {
  const booted = boot();
  const { screens } = booted;
  await roomWithGuest(booted);
  const room = screens.room;
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const copied = [];
  Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText: async (t) => copied.push(t) } }, configurable: true });
  try {
    await room.copyCode();
    assert.deepEqual(copied, [room.codeValue.value]);
    assert.equal(text(room.copyStatus), 'Code copied.');
    Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText: () => Promise.reject(new Error('blocked')) } }, configurable: true });
    await room.copyCode();
    assert.equal(room.codeValue.selected, true, 'the code selected instead');
    assert.equal(document.activeElement, room.codeValue);
    assert.equal(text(room.copyStatus), 'Code selected: copy it to share it.');
  } finally {
    if (saved) Object.defineProperty(globalThis, 'navigator', saved);
    else delete globalThis.navigator;
  }
});
