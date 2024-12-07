import readline from "readline";

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
  while (true) {
    const question = await askQuestion(
      'Enter a number to square (or type "exit"):'
    );

    if (question.toLowerCase() === "exit") {
      console.log("\nGoodbye!");
      break; // Exit the loop
    }

    const number = parseFloat(question);
    if (!isNaN(number)) {
      console.log(`\nThe square of ${number} is ${number * number}\n`); // Print the result on a new line
    } else {
      console.log("\nPlease enter a valid number.\n");
    }
  }
})();
