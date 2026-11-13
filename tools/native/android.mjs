// Builds the Android app (docs/development/native-apps.md) with Gradle, on
// any computer (gradlew, or gradlew.bat on Windows):
//
//   npm run build:android           a debug APK, signed with Android's own
//                                   debug key: to install and try
//   npm run build:android:release   the release APK and AAB, signed with
//                                   the release key when the four signing
//                                   variables are set, unsigned otherwise
//
// Both first build the itch.io release and copy it into the app
// (`npm run cap:sync`). What they make:
//
//   android/app/build/outputs/apk/debug/app-debug.apk
//   android/app/build/outputs/apk/release/app-release(-unsigned).apk
//   android/app/build/outputs/bundle/release/app-release.aab
//
// Needs JDK 21 and the Android SDK (ANDROID_HOME, or sdk.dir in
// android/local.properties).

import { spawnSync } from 'node:child_process';
import { ROOT } from '../itch/release.mjs';

const release = process.argv.includes('--release');
const tasks = release ? ['assembleRelease', 'bundleRelease'] : ['assembleDebug'];

function run(command, args, cwd = ROOT) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run('npm', ['run', 'cap:sync']);
const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
run(gradlew, [...tasks, '--no-daemon'], `${ROOT}android`);
