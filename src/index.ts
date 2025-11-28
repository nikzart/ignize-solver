import { runOrchestrator } from "./orchestrator.js";
import { runAdvancedOrchestrator } from "./advancedOrchestrator.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const useAdvanced = args.includes("--advanced") || args.includes("-a");

  try {
    if (useAdvanced) {
      await runAdvancedOrchestrator();
    } else {
      console.log("═".repeat(55));
      console.log("       UPSC PRELIMS SOLVER - Basic Mode");
      console.log("═".repeat(55));
      console.log("\nTip: Use --advanced or -a for the advanced agentic framework\n");
      await runOrchestrator();
    }
    console.log("✅ Solver completed successfully!\n");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Fatal error:", error);
    process.exit(1);
  }
}

main();
