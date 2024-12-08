import { spawn } from "child_process";
import Speaker from "speaker";
import { Readable } from "node:stream";
import data from "./audio-data.json";
import WebSocket from "ws";

class OpenAIRealtimeReadableStream extends Readable {
  private ws: WebSocket;
  constructor(url: string) {
    super();
    this.ws = new WebSocket(url, {
      headers: {
        Authorization: "Bearer " + process.env.OPENAI_API_KEY,
        "OpenAI-Beta": "realtime=v1",
      },
    });
  }

  _read() {
    this.ws.on("message", (message) => {
      this.push(message);
    });
  }
}

function decodeBase64Strings(base64Strings: string[]) {
  return base64Strings.map((base64Data) => {
    return Buffer.from(base64Data, "base64"); // Decode to raw PCM
  });
}

// Concatenate all raw PCM data
function concatenateRawPCM(rawBuffers: Buffer[]): Buffer<ArrayBuffer> {
  return Buffer.concat(rawBuffers);
}

// Function to stream raw PCM audio to the speaker
function playAudio(
  rawPCMData: Buffer<ArrayBuffer>,
  sampleRate = 24000,
  channels = 1
) {
  // Spawn FFmpeg to process the raw PCM input
  const ffmpeg = spawn("ffmpeg", [
    "-f",
    "s16le", // Input format: signed 16-bit little-endian PCM
    "-ar",
    sampleRate.toString(), // Input sample rate
    "-ac",
    channels.toString(), // Input channels
    "-i",
    "pipe:0", // Read input from stdin
    "-f",
    "wav",
    "pipe:1",
    // "s16le", // Output format: raw PCM
    // "pipe:1", // Write output to stdout
  ]);

  ffmpeg.on("close", (code) => {
    if (code === 0) {
      console.log("Audio playback finished.");
    } else {
      console.error(`FFmpeg process exited with code ${code}`);
    }
  });

  ffmpeg.on("error", (err) => {
    console.error("Error spawning FFmpeg:", err);
  });

  const symphoniaPlay = spawn("./symphonia-play", ["-"]);

  // Pipe FFmpeg's stdout to the speaker
  // const speaker = new Speaker({
  //   channels, // Number of audio channels
  //   bitDepth: 16, // Bits per sample
  //   sampleRate, // Samples per second
  // });

  // ffmpeg.stdout.pipe(speaker);

  // Pipe FFmpeg's stdout to symphonia-play's stdin
  ffmpeg.stdout.pipe(symphoniaPlay.stdin);

  // Handle errors for symphonia-play
  symphoniaPlay.on("error", (err) => {
    console.error("Error with symphonia-play:", err);
  });

  symphoniaPlay.on("close", (code) => {
    console.log(`symphonia-play process exited with code ${code}`);
  });

  // Optionally handle output/errors from symphonia-play for debugging
  // symphoniaPlay.stdout.on("data", (data) => {
  //   console.log(`symphonia-play output: ${data}`);
  // });

  symphoniaPlay.stderr.on("data", (data) => {
    console.error(`symphonia-play error: ${data}`);
  });

  // Write raw PCM data to FFmpeg's stdin
  //   ffmpeg.stdin.write(rawPCMData);
  //   ffmpeg.stdin.end();

  // Convert the Buffer to a stream
  const bufferStream = new Readable({
    read() {
      this.push(rawPCMData);
      this.push(null); // Signal end of data
    },
  });

  //   const bufferStream = Readable.from(rawPCMData);

  // Pipe the stream to FFmpeg's stdin
  bufferStream.pipe(ffmpeg.stdin);
}

// Example Usage
const base64StringDeltas = data
  .filter((response) => response.type === "response.audio.delta")
  .map((response) => response.delta as string);
// Decode, concatenate, and save the audio file
const rawPCMData = concatenateRawPCM(decodeBase64Strings(base64StringDeltas));

// Play the audio
playAudio(rawPCMData);
