"""Offline fixture generator. Original sample assets are read-only.

Requires local NumPy and Pillow; neither is downloaded or used by the website.
Produces an audio-free MP4 with recorded, deterministic camera transforms.
"""
from pathlib import Path
import argparse
import json
import math
import subprocess
import numpy as np
from PIL import Image

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--profile', choices=['projectile', 'drift-side', 'drift-top'], default='projectile')
profile = parser.parse_args().profile
if profile == 'projectile':
    width, height, fps = 960, 540, 120
    source_name, output_name, truth_name = 'sample-parabolic-motion.mp4', 'stabilization-test-projectile.mp4', 'stabilization-camera-truth.json'
elif profile == 'drift-side':
    width, height, fps = 960, 540, 60
    source_name, output_name, truth_name = 'sample-constant-speed.mp4', 'stabilization-test-drift-side.mp4', 'stabilization-drift-side-truth.json'
else:
    width, height, fps = 800, 200, '30000/1001'
    source_name, output_name, truth_name = 'sample-constant-speed_2.mp4', 'stabilization-test-drift-top.mp4', 'stabilization-drift-top-truth.json'
source = root / 'dist' / source_name
output = root / 'dist' / output_name
probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'json', str(source)]))
total_frames = int(probe['streams'][0]['nb_read_frames'])
frame_rate = float(fps) if not isinstance(fps, str) else 30000/1001
decoder = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', str(source), '-vf', f'scale={width}:{height}', '-fps_mode', 'passthrough', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'], stdout=subprocess.PIPE)
encoder = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{width}x{height}', '-r', str(fps), '-i', 'pipe:0', '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(output)], stdin=subprocess.PIPE)
matrices = []
try:
    while True:
        data = decoder.stdout.read(width*height*3)
        if not data:
            break
        if len(data) != width*height*3:
            raise RuntimeError('Incomplete decoded frame')
        n = len(matrices)
        if profile == 'projectile':
            dx = 13*math.sin(n*.37)+6*math.sin(n*.93)
            dy = 9*math.sin(n*.29)+4*math.sin(n*.79)
            angle = .012*math.sin(n*.19)
            scale = 1+.004*math.sin(n*.11)
        else:
            u, seconds = n/max(1,total_frames-1), n/frame_rate
            # Small hand shake (about 1 pixel) plus a slow 18-pixel camera drift.
            # Zero initial transform permits an independent fixed-reference check.
            dx = 18*u + 1.0*math.sin(seconds*8.1) + .35*math.sin(seconds*19.3)
            dy = -5*u + .7*math.sin(seconds*10.7)
            angle = .0015*u + .0004*math.sin(seconds*6.3)
            scale = 1+.002*u
        a,b = scale*math.cos(angle), scale*math.sin(angle)
        matrix = np.array([[a,-b,width/2-a*width/2+b*height/2+dx],[b,a,height/2-b*width/2-a*height/2+dy],[0,0,1.]])
        inverse = np.linalg.inv(matrix)
        image = Image.frombytes('RGB',(width,height),data)
        shaken = image.transform((width,height),Image.Transform.AFFINE,tuple(inverse[:2].ravel()),resample=Image.Resampling.BICUBIC,fillcolor=(0,0,0))
        encoder.stdin.write(shaken.tobytes())
        matrices.append([a,b,-b,a,float(matrix[0,2]),float(matrix[1,2])])
finally:
    decoder.stdout.close()
    encoder.stdin.close()
    d,e = decoder.wait(),encoder.wait()
if d or e:
    raise RuntimeError(f'FFmpeg exited with {d}, {e}')
metadata = {'source':source_name,'width':width,'height':height,'fps':frame_rate,'frames':len(matrices),'matrices':matrices,'audio':False,'profile':profile,'description':'Artificial camera motion; original video remains unchanged.'}
(root/'test/fixtures'/truth_name).write_text(json.dumps(metadata,indent=2)+'\n')
print(json.dumps({'file':output.name,'frames':len(matrices),'bytes':output.stat().st_size}))
