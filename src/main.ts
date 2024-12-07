import WebSocket from "ws";
import fs from "node:fs";

const url =
  "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01";

const ws = new WebSocket(url, {
  headers: {
    Authorization: "Bearer " + process.env.OPENAI_API_KEY,
    "OpenAI-Beta": "realtime=v1",
  },
});

ws.on("open", function open() {
  console.log("Connected to server.");
  ws.send(
    JSON.stringify({
      type: "response.create",
      response: {
        modalities: ["audio", "text"],
        instructions: "Please assist the user.",
      },
    })
  );
});

ws.on("message", async function incoming(message) {
  const data = JSON.parse(message.toString());
  appendJsonToFile(data, "./src/audio-data.json");
});

ws.onmessage = (event) => {
  console.log(event);
};

// ws.on("message", async function incoming(message) {
//   const data = JSON.parse(message.toString());
//   appendJsonToFile(data, "./src/audio-data.json");
// });

async function appendJsonToFile(data: any, path: string) {
  const file = fs.readFileSync(path, "utf-8");
  const fileData = JSON.parse(file);
  fileData.push(data);
  fs.writeFileSync(path, JSON.stringify(fileData, null, 2));
}

// read the data.json file

// function readJsonFile(path: string) {
//   const file = fs.readFileSync(path, "utf-8");
//   return JSON.parse(file);
// }

// const data = readJsonFile("./src/data.json");
// const responseDeltas: string[] = [];
// for (const response of data) {
//   if (response.type === "response.text.delta") {
//     responseDeltas.push(response.delta);
//   }
// }

// console.log(responseDeltas.join("\n"));
