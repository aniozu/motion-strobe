# Camera/background registration experiment — 1.23.0

This experiment is enabled only on the ChatGPT test site. The GitHub repository
and GitHub Pages are unchanged. Source starts from GitHub 1.22.5, commit
`f3973b4a3a5aa17f8f5b0a537b05f2ecd704edc7`.

## Try it

Select a profile and use **揺れ付きサンプルを試す** on the start screen.
The default is constant-speed motion from the side, with slight shake and slow
drift; the overhead example and stronger projectile example remain available.
Direct links use `?test=drift-side`, `?test=drift-top`, or `?test=projectile`.
`?test=stabilization` starts the default profile. All fixtures are audio-free.
The constant-speed demos use the original recommended time ranges and 0.1-second
interval; the projectile demo uses frames 16–88 and a 0.05-second interval.
All demos enable **カメラの揺れを補正** and start video playback at ×0.25.

Ordinary videos start with correction off. Enable it under the background
settings in the time-range screen, then create a photo. Turn it off and recreate
to compare. Changing/rebuilding correction resets position marks and length/axis
calibration because they belong to the old reference coordinates.

## Method

1. Decode only selected strobe images, up to eight background images, the
   selected range's first frame, and one alternate template one quarter into
   the range. Output coordinates stay anchored to the first frame, independently
   of the strobe sampling anchor.
2. Estimate on grayscale image pyramids with a longest edge of 384 pixels.
   Detect at most 192 distributed Shi–Tomasi features. Track with pyramidal
   Lucas–Kanade, brightness-offset removal, correlation rejection, and a
   forward/backward consistency check.
3. Estimate translation, rotation, and uniform scale using deterministic RANSAC.
   Require spatially distributed support on both axes. For larger jumps, use a
   small BRIEF descriptor match to initialize tracking. Four-point proposals may
   initialize recovery, but final accepted results require at least six inliers
   across four spatial cells; reference images need at least 12 features.
   When similarity is insufficient, a limited affine model also handles mild
   shear and unequal scale. This needs at least 14 inliers across four cells,
   support over both axes, and at least 40% of the re-tracked matches. The lower
   fraction accommodates static surfaces at different depths forming competing
   groups; it is paired with the stronger minimum count. Singular values,
   anisotropy, orientation and displacement are constrained. Descriptor/seed
   proposals are never final accepted transformations.
4. Reacquire features using the estimated global camera transform. For sparse or
   less consistent support, refine with robust photometric alignment. Moving or
   occluded pixels with large residuals receive zero weight. Dense, precise
   feature solutions keep their existing transform.
5. Apply the camera-to-reference transform once to each retained image with
   native canvas. Build the background and strobe composition afterward.
   Position tracking, preview, annotations, calibration and graphs all use this
   same corrected image space. Output dimensions and scale remain fixed.
6. Transparent/antialiased pixels outside the source frame are excluded from
   background statistics, illumination drift and foreground masks. The still
   background fills those missing regions; object pixels are not invented.
7. Video export reuses exact selected-image transforms. It estimates transforms
   for every other output frame using the same reference and caches the tiny
   matrices for subsequent exports. The last second is the corresponding photo.
8. If the first template cannot match the whole photo batch, retry the complete
   batch once with the already decoded alternate template. All frames then use
   that one fixed template; none use a failed batch. A constant template-to-first
   conversion preserves output coordinates, including intervening video frames.
   There is no chain of frame-to-frame camera transforms and no growing drift.
9. Continue past unmatched frames so future measurements remain available.
   Choose the fixed template with fewer missing matches, predict missing poses
   from measured neighbors using actual video timestamps, and re-match with
   those predictions as initial guesses. Frames still missing are interpolated;
   with only one neighbor, hold the closest measured pose. Separate rotation,
   positive symmetric stretch/shear and image-center displacement during
   interpolation. Estimated poses never become interpolation anchors. Video
   rendering follows the same policy with future measured photo poses already
   available, and keeps exact photo transforms for shared frames.

There is no extra model, OpenCV download, upload, server computation, or runtime
dependency. Work runs in the existing worker, yields between selected images,
and uses existing cancellation and progress controls. Video decoding already
yields between bounded packet batches. Photo transforms do not accumulate
frame-to-frame drift.

## Confidence and limitations

Individual unmatched frames no longer stop photo or video creation. The result
notice explicitly reports estimated correction if interpolation or holding was
used. There is no hard duration cutoff for a gap: the owner prefers an approximate
result to aborting. A long gap or abrupt motion can therefore produce substantial
alignment error. Frames without a usable reference image, or a wholly featureless
reference with no usable alternate, still cannot be registered. Invalid video or
decoder failures retain their existing handling. Changing a decoder does not
repair background matches; estimates operate on the decoded pixels instead.

Registration residual statistics describe measured poses only. Estimated poses
have separate interpolation/holding counts and are not assigned invented
subpixel residuals. They do not prove accurate camera or object positions.

The method assumes a static background with enough detail spread over the image
and a substantial shared field of view. It can correct small hand shake, rotation,
and moderate image-scale changes. Parallax between different depths, rolling
shutter distortion, motion blur, moving backgrounds, large pans, or an object
occupying most of the view can still fail or leave residual error. A uniform
image of paper alone is deliberately rejected; textured edges around paper can
provide sufficient support. Correction does not undo exposure-time blur or
recover missing object pixels at the borders. Movement and lengths after
correction are relative to the chosen background, not a 3D camera calibration.

### 1.23.2 real-recording failure recovery

A privately supplied portrait recording (120 fps, 207 frames) reproduced the
photo-stage failure. Changing camera direction introduced nonuniform scale and
parallax, so not every frame could match the original similarity-only template.
The revised native-canvas worker pipeline completed an all-range, 0.05-second
photo (35 strobe images and automatic background) using the fixed alternate
template at frame index 51. Registration of 43 cached frames took about 3.4 s
locally, excluding decode/drawing; this is not a browser or device benchmark.
The same pipeline produced 133 video frames; the final hold equals the photo
resized to the video encoder dimensions. Turning correction off restored the
original uncorrected composition exactly.

The moving ball remains visible, but desk/chair/ceiling edges still leave traces
because surfaces at different depths cannot all be aligned by one affine model.
Successful matching does not mean pixel-perfect stabilization or guaranteed
position accuracy in this scene. No private recording, audio, extracted image,
or reconstructed photo is included in the source repository or deployed assets.
Tests instead retain synthetic shear, first-frame coordinates, fixed-template
recovery and video consistency regressions.

## Verification

- Deterministic synthetic moving-object sequences test translation, rotation,
  uniform scale, larger jumps, brightness drift, inverse transforms, missing
  borders, unrelated images, featureless images, and cancellation.
- Original projectile frames with added known transforms: all 13 images matched;
  mean transform discrepancy about 0.47 px, maximum 0.77 px at 960×540. This
  includes small movement already present in the original recording.
- Encoded artificial-shake MP4: all 73 frames from 16–88 matched. Mean transform
  discrepancy about 0.25 px, maximum 1.49 px at 960×540. About 0.33 s for 19
  selected/background frames, 1.24 s for all 73 on this machine, excluding decode.
  These are controlled local measurements, not browser/phone timing guarantees.
- A real FFmpeg decoder plus a native canvas adapter exercises the worker,
  automatic/manual background, composition, corrected tracking preview and
  automatic ball-position detection, video
  live-frame rendering, final hold, and rebuilding with correction disabled.
  Static-edge mean squared color error fell from about 7488 to 113, and 2282 blue
  ball pixels remained. The video's final rendered pixels match the PNG exactly.
- Existing tests cover MP4 muxing, actual FFmpeg decoding, frame timing, object
  tracking, multilingual builds, analytics boundaries and the previous UI.
- Native browser WebCodecs/UI verification was unavailable in this environment.
  The native canvas pipeline uses decoder/encoder adapters; it does not claim
  native Safari/Chrome/iPad validation. The canvas-specific test skips when the
  optional validation library is unavailable; the core registration tests do not.

Regenerate the fixture with `python3 scripts/create-stabilization-sample.py`
(offline NumPy/Pillow + FFmpeg). The original media assets are never overwritten.
All new interface text is localized in the existing 12 languages.

## References

- OpenCV optical-flow tutorial (the standard Shi–Tomasi/Lucas–Kanade approach):
  https://docs.opencv.org/4.x/d4/dee/tutorial_optical_flow.html
- OpenCV robust similarity estimation, including translation, rotation and scale:
  https://docs.opencv.org/4.x/d9/d0c/group__calib3d.html
- OpenCV image alignment/ECC documentation, for photometric refinement concepts:
  https://docs.opencv.org/4.x/dc/d6b/group__video__track.html

The browser implementation here is a small independent JavaScript module using
these established methods; it does not include the OpenCV library.

## Slow-drift checks — 1.23.1

No camera-registration algorithm changes were needed. New independent tests and
two additional demo videos verify gradual camera movement as well as strong
shake. The correction module never receives the fixture's ground-truth matrices;
they live only in the offline generator and test fixtures, outside deployed assets.

The original constant-speed examples from the side and from above receive a
slow 18-pixel horizontal / 5-pixel vertical displacement over the whole clip,
about one pixel of oscillatory shake, and very small rotational/scale drift.
All frames are aligned, then the same object's green area is measured in both
the unaltered and altered footage. Baseline and altered footage use the same
fixed reference convention; ordinary movement already in the original recording
is not counted as artificial camera-motion error. No constant-velocity constraint
or trajectory straightening is supplied to registration.

Measured local results, using actual native-canvas warped pixels:

| Example | Analysis size | Measurable positions | x-coordinate RMS difference | Fitted velocity difference |
| --- | --- | --- | --- | --- |
| Side view | 640×360 | 41 | 0.239 px | 0.0408% |
| Overhead | 800×200 | 21 | 0.300 px | 0.0969% |

The side clip's 158 frames and overhead clip's 84 frames all registered. Camera
transform discrepancies against the original-frame baseline plus the known added
motion averaged 0.214 px / 0.116 px, with maxima 0.573 px / 0.288 px. Selected
photo/background images and every intervening frame also pass with the editor's
actual first-selected-frame reference. Frames where the object is absent or
clipped at the image edge are excluded from velocity comparison, not invented.

A separate controlled moving-object sequence covers 120 selected images across
29.75 seconds with a 24-pixel gradual drift. Mean camera error in the first and
last 20 images is 0.0071 px and 0.0084 px; maximum error is 0.0225 px. Added camera
motion biases the fitted velocity by 11.922% before correction and about −0.001%
after correction. A static-camera sequence with a moving object also passes:
correction does not introduce artificial drift. These synthetic figures are not
claims about all real handheld footage or phone performance.

The generator simulates geometric image movement. It does not simulate or remove
exposure-time motion blur, rolling shutter or 3D parallax. A shared, sufficiently
textured portion of the initial background must remain visible.

Regenerate the new demos with
`python3 scripts/create-stabilization-sample.py --profile drift-side` and
`python3 scripts/create-stabilization-sample.py --profile drift-top`.
