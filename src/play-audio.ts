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
    "s16le", // Output format: raw PCM
    "pipe:1", // Write output to stdout
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

  // Pipe FFmpeg's stdout to the speaker
  const speaker = new Speaker({
    channels, // Number of audio channels
    bitDepth: 16, // Bits per sample
    sampleRate, // Samples per second
  });

  ffmpeg.stdout.pipe(speaker);

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
