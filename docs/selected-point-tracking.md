# Selected-point tracking (1.22.0)

The existing object-center mode still measures a foreground region's pixel
centroid. Selected-point mode instead preserves a user-specified material point.
It does not infer physical center of mass from an image.

## Method and bounded work

- Reuse the existing extracted-frame cache. No extra decode, upload, model
  download or OpenCV bundle is needed.
- Detect foreground candidates on an image with longest edge <=384 pixels.
  Close small mask gaps to retain thin handles; never change the composite mask.
- Use region area and second moments for position, scale and the two possible
  principal-axis orientations. Match RGB samples from the original frame after
  applying rotation and scale. Preserve the initial template until a manual
  correction explicitly replaces the anchor.
- At most three nearby regions enter registration. A full coarse rotation is
  attempted only for poor initial matches. Translation, rotation and scale
  refinement use fixed iteration counts and bilinear sampling.
- Use <=121 color samples per template, including negative silhouette samples
  and a denser patch around the selected point. A chromatic prefilter limits
  local marker refinement; search radius <=48 original-image pixels.
- Distinct competing objects, doubtful registration and point-only recovery
  are flagged Needs review. Missing matches have no coordinates. Neither may
  anchor the next frame. Graphs already omit doubtful/missing observations.
- Run both directions from the seed, preserving every manual/skip mark exactly.
  Yield after each frame and discard the result on cancellation. Extra working
  images are small; no second full-resolution frame stack is allocated.

The object-center mode additionally compares a 64-bin RGB histogram rather
than relying only on an object's mean color. Its existing motion hypotheses,
manual anchors and uncertainty logic remain in place.

## Why registration rather than adjacent-frame optical flow

Selected strobe frames can be separated by substantial translation and rotation.
Sparse optical flow is useful between nearby frames, but bridging these gaps
can require more decoded frames. Masked color registration with region-derived
initial poses works directly on the existing selected frames. This is a small
purpose-built JavaScript implementation, not an OpenCV dependency.

Primary references:

- OpenCV color/masked template matching:
  https://docs.opencv.org/4.13.0/df/dfb/group__imgproc__object.html
- OpenCV sparse flow and geometric image registration:
  https://docs.opencv.org/4.13.0/dc/d6b/group__video__track.html
- OpenCV similarity transforms (translation, rotation, uniform scale):
  https://docs.opencv.org/4.13.0/d9/d0c/group__calib3d.html

## Verification and limits

Tests include a rotating, scaling marked hammer with lighting drift and a colored
distractor; exact manual corrections; skipped/absent frames; cancellation;
per-object UI modes; and the existing worker/cache/export pipeline.

The real sample-hammer.mp4 test uses 19 selected 960x540 frames (native frame
174 through 282 in increments of 6). A red-color-only marker centroid supplies
an independent approximate reference. Clear frames 1-11 agree within 2.5 px;
the development run was approximately 0.35 s for the 19-frame tracking step.
This excludes decoding/background synthesis and is not a device-independent
performance or physical-accuracy guarantee. The first overlapping frame is
flagged for review, as are exiting frames; later frames are missing.

Blur, a hidden/very small marker, identical nearby objects, large shape changes
and out-of-plane rotation remain challenging. Pixel precision is not a claim
of subpixel physical measurement accuracy. Native browser QA is separate from
the deterministic worker/canvas adapter tests.
