import type { UnderlyingSource } from "node:stream/web";
import WebSocket from "ws";
import readline from "readline";
import Speaker from "speaker";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function* streamAsyncIterator<T>(
  reader: ReadableStreamDefaultReader<T>
): any {
  try {
    const { done, value } = await reader.read();
    if (done) return;
    yield value;
    yield* streamAsyncIterator(reader);
  } finally {
    reader.releaseLock();
  }
}

class OpenAIWSSStream implements UnderlyingSource {
  private ws: WebSocket;
  constructor(ws: WebSocket) {
    this.ws = ws;
  }

  start(controller: ReadableStreamDefaultController) {
    this.ws.on("message", (message) => {
      const data = JSON.parse(message.toString());
      controller.enqueue(data);
    });

    this.ws.on("close", () => {
      controller.close();
    });

    this.ws.on("error", (error) => {
      controller.error(error);
    });
  }

  cancel(reason?: string) {
    console.error("[OpenAIWSSStream]", reason);
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
  }
}

class OpenAIAudioDeltasBufferStream implements Transformer {
  transform(chunk: any, controller: TransformStreamDefaultController): void {
    if (chunk.type === "response.audio.delta") {
      const base64Data = chunk.delta;
      const rawPCMData = Buffer.from(base64Data, "base64");
      controller.enqueue(rawPCMData);
    }
  }
  flush(controller: TransformStreamDefaultController): void {
    controller.terminate();
  }
}

export class OpenAIRealtimeAudio {
  private url =
    "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01";

  private ws: WebSocket;
  private wssStream: ReadableStream;

  constructor() {
    this.ws = new WebSocket(this.url, {
      headers: {
        Authorization: "Bearer " + process.env.OPENAI_API_KEY,
        "OpenAI-Beta": "realtime=v1",
      },
    });

    this.wssStream = new ReadableStream(new OpenAIWSSStream(this.ws));
  }

  public async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws.on("open", async () => {
        console.error("Connected to server.");
        const initialStartEvent = {
          type: "response.create",
          response: {
            modalities: ["audio", "text"],
            instructions: "Please assist the user.",
          },
        };

        this.ws.send(JSON.stringify(initialStartEvent));
        await this.playAudio();
        resolve();
      });

      this.ws.on("error", (err) => {
        console.error("Error connecting to server:", err);
        reject(err);
      });
    });
  }

  private async playAudio(): Promise<void> {
    const sampleRate = 24000;
    const channels = 1;

    return new Promise<void>(async (resolve, reject) => {
      const [OpenAIWSSStream, OpenAIWSSStream2] = new ReadableStream({
        start: async (controller) => {
          const reader = this.wssStream.getReader();
          for await (const chunk of streamAsyncIterator(reader)) {
            controller.enqueue(chunk);

            if (chunk.type === "response.done") {
              controller.close();
              break;
            }
          }
        },
      }).tee();

      const OpenAITranscriptStream = OpenAIWSSStream2.pipeThrough(
        new TransformStream({
          transform(chunk, controller) {
            if (chunk.type === "response.audio_transcript.delta") {
              controller.enqueue(chunk.delta);
            }
          },
        })
      );

      const speaker = new Speaker({
        channels, // Number of audio channels
        bitDepth: 16, // Bits per sample
        sampleRate, // Samples per second
      });

      speaker.on("close", () => {
        resolve();
      });

      speaker.on("error", (err) => {
        console.error("Speaker error:", err);
        reject(err);
      });

      const speakerWritableStream = new WritableStream({
        write(chunk) {
          speaker.write(chunk);
        },
        close() {
          speaker.end();
        },
      });

      try {
        await OpenAIWSSStream.pipeThrough(
          new TransformStream(new OpenAIAudioDeltasBufferStream())
        )
          .pipeTo(speakerWritableStream)
          .then(async () => {
            const transcriptReader = OpenAITranscriptStream.getReader();

            let totalTranscript = "";
            for await (const transcript of streamAsyncIterator(
              transcriptReader
            )) {
              totalTranscript += transcript;
            }

            console.log("[BOT]> ", totalTranscript);
          });
      } catch (e) {
        console.error("Error in OpenAIWSSStream:", e);
        reject(e); // Reject the promise if the stream encounters an error
      }
    });
  }

  public async send(message: string) {
    // check if the websocket is open

    const conversationItem = {
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: message,
          },
        ],
      },
    };

    this.ws.send(JSON.stringify(conversationItem));
    this.ws.send(JSON.stringify({ type: "response.create" }));

    await this.playAudio();
  }

  public disconnect() {
    this.ws.close();
  }
}

const askQuestion = (question: string): Promise<string> => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
};

// Signal handler for Ctrl+C
process.on("SIGINT", () => {
  console.log("\nGoodbye!");
  process.exit(0); // Exit gracefully
});

(async () => {
  console.log("Type 'exit' to quit or press Ctrl+C to terminate.");

  const openAIRealtimeAudio = new OpenAIRealtimeAudio();
  await openAIRealtimeAudio.connect();

  while (true) {
    const question = await askQuestion("[YOU]>  ");

    if (question.toLowerCase() === "exit") {
      console.log("\nGoodbye!");
      openAIRealtimeAudio.disconnect();
      break; // Exit the loop
    }

    await openAIRealtimeAudio.send(question);
  }
})();
