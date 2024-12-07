import fs from "node:fs";

// A helper function to create a WAV file header
function createWAVHeader(sampleRate, numChannels, bitsPerSample, dataSize) {
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;

  const buffer = Buffer.alloc(44);
  buffer.write("RIFF", 0); // ChunkID
  buffer.writeUInt32LE(36 + dataSize, 4); // ChunkSize
  buffer.write("WAVE", 8); // Format
  buffer.write("fmt ", 12); // Subchunk1ID
  buffer.writeUInt32LE(16, 16); // Subchunk1Size
  buffer.writeUInt16LE(1, 20); // AudioFormat (1 = PCM)
  buffer.writeUInt16LE(numChannels, 22); // NumChannels
  buffer.writeUInt32LE(sampleRate, 24); // SampleRate
  buffer.writeUInt32LE(byteRate, 28); // ByteRate
  buffer.writeUInt16LE(blockAlign, 32); // BlockAlign
  buffer.writeUInt16LE(bitsPerSample, 34); // BitsPerSample
  buffer.write("data", 36); // Subchunk2ID
  buffer.writeUInt32LE(dataSize, 40); // Subchunk2Size

  return buffer;
}

// Function to save audio output
async function saveAudio(apiUrl, apiKey, outputFile) {
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "response.create",
      item: {
        type: "audio",
        // Add the necessary payload (context and input)
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.statusText}`);
  }

  const data = await response.json();
  const base64Audio = data.output.audio; // Assuming the API response has this structure

  // Decode the base64 audio to a Buffer
  const audioBuffer = Buffer.from(base64Audio, "base64");

  // Create a WAV header for the PCM audio data
  const wavHeader = createWAVHeader(16000, 1, 16, audioBuffer.length); // 16 kHz, mono, 16-bit

  // Write the header and audio data to a WAV file
  const wavData = Buffer.concat([wavHeader, audioBuffer]);
  fs.writeFileSync(outputFile, wavData);

  console.log(`Audio saved to ${outputFile}`);
}

// Use the function
const apiUrl =
  "https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01"; // Replace with the actual endpoint
const apiKey = "your_openai_api_key"; // Replace with your API key
const outputFile = "./output.wav";

saveAudio(apiUrl, apiKey, outputFile).catch(console.error);
