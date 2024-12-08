import data from "./audio-data.json";
import fs from "node:fs";
import ffmpeg from "fluent-ffmpeg";
import Speaker from "speaker";

// Decode and save each Base64 string to raw PCM data
function decodeBase64Strings(base64Strings: string[]) {
  return base64Strings.map((base64Data) => {
    return Buffer.from(base64Data, "base64"); // Decode to raw PCM
  });
}

// Concatenate all raw PCM data
function concatenateRawPCM(rawBuffers: Buffer[]): Buffer<ArrayBuffer> {
  return Buffer.concat(rawBuffers);
}

// Write the final PCM data to a file using FFmpeg
function saveAsAudioFile(
  rawPCMData: Buffer,
  outputPath: string,
  sampleRate = 24000,
  channels = 1
) {
  const tempFile = "./temp.raw";

  // Write raw PCM data to a temp file
  fs.writeFileSync(tempFile, rawPCMData);

  // Use FFmpeg to convert raw PCM to WAV/MP3
  ffmpeg(tempFile)
    .inputOptions([
      "-f s16le", // Input format
      `-ar ${sampleRate}`, // Sample rate
      `-ac ${channels}`, // Number of channels
    ])
    .output(outputPath)
    .on("start", (commandLine) => {
      console.log("Spawned FFmpeg with command: " + commandLine);
    })
    .on("end", () => {
      console.log(`Audio file saved at ${outputPath}`);
      fs.unlinkSync(tempFile); // Cleanup temp file
    })
    .on("error", (err) => {
      console.error("Error while creating audio file:", err);
    })
    .run();
}

const base64StringDeltas = data
  .filter((response) => response.type === "response.audio.delta")
  .map((response) => response.delta as string);
// Decode, concatenate, and save the audio file
const rawPCMData = concatenateRawPCM(decodeBase64Strings(base64StringDeltas));
saveAsAudioFile(rawPCMData, "./output6.pcm");
