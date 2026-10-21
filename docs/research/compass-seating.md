# Compass-based seat detection: feasibility

Research for [#4](https://github.com/erikblomqvist/when-then/issues/4). Researched 2026-10-20.

**Question:** Can phones work out where players sit around a table from the compass, so seating can be set automatically?

## Verdict: **later**, not v1

It is technically possible on the browsers that matter, but it can't be the only way to set seating, and it doesn't make the v1 seating flow simpler:

- **It works only with a magnetic compass.** Each phone's gyroscope frame is arbitrary, so headings from different phones can only be compared against magnetic north. Magnetic headings are the input most exposed to interference. Chrome made `deviceorientation` relative in Chrome 50 for exactly this reason (see §3).
- **Every phone must grant a sensor permission** from a tap on iOS, and soon on Chrome too. On iOS, a "Don't allow" can't be retried from the page (§2).
- **Close seats are the weak spot.** With 2–4 players the seat gaps (90°+) are much larger than the expected error, so ordering is easy. With 7–10 players the gaps are 36–51°, close to the combined error of each phone's compass (often around ±10° or more) plus how well each person points. Some adjacent swaps will happen (§4).
- **So a manual seating editor is needed anyway**, to confirm and fix the result. That editor is the v1 seating flow. The compass can later fill in a first guess for it.

Recommendation: v1 ships manual seating. The compass becomes a `later` issue: an optional "Detect seats" button that pre-fills the same editor. The *Seating flow prototype* should design the manual editor so this button can slot in (§7).

## 1. Which API each browser provides

| Browser | Absolute heading source | Permission API | Source |
|---|---|---|---|
| iOS Safari (all iOS browsers use WebKit) | `event.webkitCompassHeading` + `webkitCompassAccuracy` on `deviceorientation` (iOS-only, non-standard). `absolute` is **not** exposed on iOS. `alpha` is relative (arbitrary reference) | `DeviceOrientationEvent.requestPermission()` since iOS 14.5 per BCD (the API dates from iOS 13) | WebKit IDL, BCD |
| Chrome Android / Samsung Internet / WebView | `deviceorientationabsolute` event (Chrome 50+), `absolute === true` | `requestPermission()` shipped 151/152, but default stays **Allow** for now | BCD, blink-dev I2S |
| Firefox Android | `deviceorientationabsolute` since Firefox 110 | none (`requestPermission` not implemented) | BCD |
| Desktop browsers | No usable sensors | n/a | n/a |

Evidence:

- WebKit's `DeviceOrientationEvent.idl` exposes `webkitCompassHeading` and `webkitCompassAccuracy` only under `WTF_PLATFORM_IOS_FAMILY`. The `absolute` attribute is only in the non-iOS branch. The interface is `[SecureContext]`. ([WebKit source](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/dom/DeviceOrientationEvent.idl))
- On iOS, WebKit starts `CMMotionManager startDeviceMotionUpdates` with no reference frame, so `alpha` is relative. It takes the heading from `CLLocationManager`: `heading = newHeading.magneticHeading` and `headingAccuracy = newHeading.headingAccuracy`, with -1 when no heading is available. ([WebCoreMotionManager.mm](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/ios/WebCoreMotionManager.mm)) So `webkitCompassHeading` is a **magnetic** heading from Core Location.
- MDN browser-compat-data (`api/DeviceOrientationEvent.json`, `api/Window.json`, main branch, read 2026-10-20) lists the following. `requestPermission_static`: Chrome 152, Safari iOS 14.5, Firefox none. `deviceorientationabsolute_event`: Chrome 50, Firefox 110, Safari none. `absolute`: Safari iOS none. ([BCD](https://github.com/mdn/browser-compat-data/blob/main/api/DeviceOrientationEvent.json))
- W3C Device Orientation and Motion, CR Draft 12 Feb 2025:
  - `deviceorientationabsolute` is "at risk due to limited implementation experience".
  - Absolute orientation requires the `magnetometer` permissions-policy feature, plus `accelerometer` and `gyroscope`.
  - All interfaces are secure-context only.
  - Values are limited to no more precision than 0.1°.
  - If a device can never provide absolute data, the event fires with null angles.
  - Appendix A.1 has a non-normative `compassHeading(alpha, beta, gamma)` function for absolute values.

  ([spec](https://www.w3.org/TR/orientation-event/))

**Implication:** we need two code paths. On iOS, read `webkitCompassHeading`. Elsewhere, read `deviceorientationabsolute` and convert with the spec's A.1 formula. If neither gives data, hide the feature.

## 2. Permission flow and its UX cost

**iOS (WebKit)**, from [DeviceOrientationEvent.cpp](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/dom/DeviceOrientationEvent.cpp) and [WebDeviceOrientationAndMotionAccessController.cpp](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/WebsiteData/WebDeviceOrientationAndMotionAccessController.cpp):

- Calling `requestPermission()` without a user gesture, while the state is still "prompt", rejects with `NotAllowedError` ("requires a user gesture to prompt"). It must be called from a tap handler.
- The decision is cached per **top-level origin** in the website data store. Once the user answers, later calls return that cached `granted`/`denied` **without prompting again**. A "Don't allow" therefore can't be fixed from the page. The user has to reset it in Safari, or the data store has to be cleared. Whether the cache survives an app relaunch is not established from this code (the map is held in memory). Test on a device.
- The prompt is one system alert per phone. Every player in the game sees it, not just the host.

**Chrome (Blink)**, from the [Intent to Ship, June 2026](https://groups.google.com/a/chromium.org/g/blink-dev/c/ckd2rFmT3PA):

- `requestPermission()` ships in Chrome 151 (the thread says 151; BCD says 152). The sensor setting becomes Allow/Ask/Block, but "Initially the feature will have no effect as long as the default permission is ALLOW". Ask-by-default is a later step with no date. After that, Chrome behaves like iOS: no events until `requestPermission()` is called from a gesture. WebView always returns "granted".
- Rule for us: **always call `requestPermission()` if it exists, from a tap**, on every platform.

**Cost:** every player taps "Allow motion & orientation" on a permission screen that has nothing to do with the game itself. Anyone who declines can't take part in auto-seating. The whole table then falls back to manual seating, or that player is placed by hand.

## 3. Accuracy and calibration indoors

- **Chrome itself moved away from the magnetometer for `deviceorientation`.** The magnetometer "is susceptible to nearby magnetic field fluctuations that could throw off the readings". The absolute behaviour was moved to `deviceorientationabsolute`. ([Chrome 50 post](https://developer.chrome.com/blog/device-orientation-changes))
- **iOS accuracy:** Apple's `CLHeading.headingAccuracy` is "the maximum deviation (measured in degrees) between the reported heading and the true geomagnetic heading … A negative value means that the reported heading is invalid, which can occur when the device is uncalibrated or there is strong interference from local magnetic fields." ([Apple](https://developer.apple.com/documentation/corelocation/clheading/headingaccuracy)) WebKit passes this through as `webkitCompassAccuracy`. MDN notes it is "usually 10" ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent)).
- **Android accuracy:** the rotation vector fuses the accelerometer, gyroscope and magnetometer. Its HAL reports `estimated_accuracy` (radians), and "the heading error must be less than estimated_accuracy 95% of the time". ([AOSP sensor types](https://source.android.com/docs/core/interaction/sensors/sensor-types)) **The web API does not expose this value.** On Android we can't tell a good reading from a bad one.
- **Calibration:** the magnetometer uses online hard-iron calibration. Android's guidance is that accuracy improves by "waving the device in a figure-8 pattern". ([Android position sensors](https://developer.android.com/develop/sensors-and-location/sensors/sensors_position)) The spec removed `compassneedscalibration`, so the web gets no calibration signal ([spec changelog](https://www.w3.org/TR/orientation-event/)).
- **Party-table interference:** steel table frames, other phones (MagSafe magnets, speakers), laptops and wiring all distort the field locally. None of these sources measure it. It is inferred from the hard/soft-iron calibration model above and Apple's "strong interference from local magnetic fields". The key point is that **the distortion differs at each seat**, so the per-phone errors don't cancel each other out.

## 4. Can relative headings give a seating order for 2–10 players?

Geometry: a player at compass bearing φ from the table centre who points at the centre reads heading φ + 180°. Sorting players by heading gives their **cyclic order**. Compass bearings increase clockwise seen from above, so ascending order is **clockwise**, which is the game's turn direction. Two things that don't matter:

- **The shared offset.** Only differences are used, so magnetic declination and true vs magnetic north don't matter.
- **Timing.** Each heading is absolute, so players don't have to point at the same moment.

What can go wrong:

- **Seat gap vs error.** On a round table the seat gap is 360°/n: 180° (2 players), 120° (3), 90° (4), 60° (6), 45° (8), 36° (10). Two neighbours swap when their combined error exceeds the gap. A ±10° compass error per phone plus pointing error makes a 36–45° gap tight. Swaps between neighbours become likely at 8–10 players, especially with interference.
- **Rectangular tables.** People sitting next to each other on a long side get bigger gaps than on a round table. People at the corners, or squeezed in at an end, can end up only 20–30° apart.
- **2 players:** order is meaningless, so nothing needs detecting. **3 players:** only two possible orders, and the 120° gaps make it robust.
- **Phone pose:** `webkitCompassHeading` is the heading of the top edge of the phone, based on Core Location's portrait default. On Android it comes from the A.1 formula. Asking players to **lay the phone flat with the top edge pointing at the centre** gives the same pose on both platforms and removes hand wobble. The trade-off is that a flat phone sits closest to a steel table frame. Hold-up-and-point is the alternative. The prototype should test both.
- **Bad readings:** use `webkitCompassAccuracy`. Reject readings below 0 or above about 20 and ask for a figure-8. Android gives no such signal. Ask for a few seconds of steady readings and use the circular mean.

**Conclusion:** reliable enough to pre-fill an order for small groups. Not reliable enough to commit an order without anyone checking it at 6–10 players.

## 5. PWA vs browser tab

- The API works only in secure contexts, and needs the `magnetometer`, `accelerometer` and `gyroscope` permissions policy for absolute data. A top-level PWA has these by default (`'self'`). ([spec](https://www.w3.org/TR/orientation-event/))
- I found no primary source (WebKit bug, Apple docs) that describes different behaviour for iOS Home Screen web apps. The permission cache is keyed by the top-level origin in the website data store. A Home Screen web app on iOS has its own data store, separate from Safari's. That suggests (not verified) that a player who allowed access in a Safari tab will be prompted again in the installed app. **Test on a device.**
- Android Chrome: the installed PWA and the tab share the Chrome profile and its site settings. No difference was documented.

## 6. Fallbacks

1. **Manual seating editor** (the v1 flow): drag to reorder, or tap seats in order, on the host's phone. This must exist anyway.
2. **Compass pre-fill** (later): enabled only when the host turns it on and every phone reports a heading. Otherwise the editor opens empty, in join order.
3. If any phone declines, gives no data (desktop, no magnetometer, iOS accuracy < 0) or times out, place that player by hand. The other headings still order everyone else.

## 7. Constraints for *Seating flow prototype*

- Model seating as a **cyclic order of player IDs** (clockwise = turn order). Don't store positions or angles. The compass is only an input that proposes this order.
- The manual editor is the source of truth and always gets a confirm step. Design it to accept a pre-filled order.
- Leave room for a later "Detect seats" step: per-phone permission tap → "point at the table centre" → live dial showing everyone's heading → host confirms. Don't build it in v1.
- Any orientation code must:
  - call `requestPermission()` from a tap if it exists;
  - branch on `webkitCompassHeading` (iOS) vs `deviceorientationabsolute` (Chrome/Firefox Android);
  - treat missing data or a denial as "manual for this player".
- Screen Wake Lock (already a v1 constraint) doesn't interact with this. Sensor events only fire while the document is visible (spec), so players must keep the app in the foreground while pointing.

## Open questions (need a device test, not more reading)

- Real heading spread among 6–10 phones around a typical (wooden or steel-framed) table.
- Whether iOS remembers the decision across relaunches, and between a Safari tab and the installed app.
- Whether flat-on-table or hold-and-point gives the smaller error.
