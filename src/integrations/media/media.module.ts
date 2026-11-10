import { Module } from '@nestjs/common';
import { Cutout, OnnxCutout } from './cutout.js';
import { CanvasMotionStudio, MotionStudio } from './motion/motion-studio.js';
import { FfmpegVideoTools, VideoTools } from './video-tools.js';

/** Video processing on the API's machine: ffmpeg, product cut-outs and motion templates. */
@Module({
  providers: [
    { provide: VideoTools, useClass: FfmpegVideoTools },
    { provide: Cutout, useFactory: () => new OnnxCutout() },
    { provide: MotionStudio, useClass: CanvasMotionStudio },
  ],
  exports: [VideoTools, MotionStudio],
})
export class MediaModule {}
