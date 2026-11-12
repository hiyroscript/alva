// Apply Alva's landscape-only presentation to generated Capacitor projects.
// Platform folders are generated locally/inside CI and are not committed.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const androidManifest = 'android/app/src/main/AndroidManifest.xml';
if (existsSync(androidManifest)) {
  const xml = readFileSync(androidManifest, 'utf8');
  const activity = /<activity\b[^>]*android:name="\.MainActivity"[^>]*>/;
  const match = xml.match(activity);
  if (!match) throw new Error('Could not find .MainActivity in ' + androidManifest);
  let tag = match[0];
  if (/android:screenOrientation=/.test(tag)) {
    tag = tag.replace(/android:screenOrientation="[^"]*"/, 'android:screenOrientation="landscape"');
  } else {
    tag = tag.replace(/>$/, ' android:screenOrientation="landscape">');
  }
  writeFileSync(androidManifest, xml.replace(match[0], tag));
  console.log('Android: locked Alva to landscape.');
}

const iosPlist = 'ios/App/App/Info.plist';
if (existsSync(iosPlist)) {
  let plist = readFileSync(iosPlist, 'utf8');
  const phone = '<key>UISupportedInterfaceOrientations</key>\n\t<array>\n\t\t<string>UIInterfaceOrientationLandscapeLeft</string>\n\t\t<string>UIInterfaceOrientationLandscapeRight</string>\n\t</array>';
  const ipad = '<key>UISupportedInterfaceOrientations~ipad</key>\n\t<array>\n\t\t<string>UIInterfaceOrientationLandscapeLeft</string>\n\t\t<string>UIInterfaceOrientationLandscapeRight</string>\n\t</array>';
  const replaceOrInsert = (source, key, block) => {
    const re = new RegExp('<key>' + key.replace(/[.*+?^$()|[\]\\]/g, '\\$&') + '</key>\\s*<array>[\\s\\S]*?<\\/array>');
    if (re.test(source)) return source.replace(re, block);
    return source.replace(/\s*<\/dict>\s*<\/plist>\s*$/, '\n\t' + block + '\n</dict>\n</plist>\n');
  };
  plist = replaceOrInsert(plist, 'UISupportedInterfaceOrientations', phone);
  plist = replaceOrInsert(plist, 'UISupportedInterfaceOrientations~ipad', ipad);
  writeFileSync(iosPlist, plist);
  console.log('iOS: locked Alva to landscape on iPhone and iPad.');
}

if (!existsSync(androidManifest) && !existsSync(iosPlist)) {
  throw new Error('No generated Capacitor Android or iOS project found. Run npx cap add first.');
}
