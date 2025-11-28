import cliProgress from "cli-progress";

export class ProgressTracker {
  private multiBar: cliProgress.MultiBar;
  private overallBar: cliProgress.SingleBar | null = null;
  private batchBar: cliProgress.SingleBar | null = null;
  private totalQuestions: number = 0;
  private completedQuestions: number = 0;
  private currentBatch: number = 0;
  private totalBatches: number = 0;
  private correctCount: number = 0;

  constructor() {
    this.multiBar = new cliProgress.MultiBar(
      {
        clearOnComplete: false,
        hideCursor: true,
        format: "{bar} | {task} | {value}/{total} | {percentage}% | {status}",
        barCompleteChar: "\u2588",
        barIncompleteChar: "\u2591",
      },
      cliProgress.Presets.shades_classic
    );
  }

  start(totalQuestions: number, totalBatches: number): void {
    this.totalQuestions = totalQuestions;
    this.totalBatches = totalBatches;
    this.completedQuestions = 0;
    this.correctCount = 0;
    this.currentBatch = 0;

    console.log("\n🚀 Starting UPSC Prelims Solver\n");
    console.log(`📝 Total Questions: ${totalQuestions}`);
    console.log(`📦 Batches: ${totalBatches} (${totalQuestions / totalBatches} questions each)\n`);

    this.overallBar = this.multiBar.create(totalQuestions, 0, {
      task: "Overall    ",
      status: "Starting...",
    });
  }

  startBatch(batchNumber: number, batchSize: number): void {
    this.currentBatch = batchNumber;

    // Remove previous batch bar if exists
    if (this.batchBar) {
      this.multiBar.remove(this.batchBar);
    }

    this.batchBar = this.multiBar.create(batchSize, 0, {
      task: `Batch ${batchNumber}/${this.totalBatches}`,
      status: "Processing...",
    });
  }

  updateBatchProgress(completed: number, batchSize: number): void {
    if (this.batchBar) {
      this.batchBar.update(completed, {
        status: `${completed}/${batchSize} done`,
      });
    }
  }

  completeBatch(batchNumber: number, correctInBatch: number, totalInBatch: number): void {
    this.completedQuestions += totalInBatch;
    this.correctCount += correctInBatch;

    const accuracy = ((this.correctCount / this.completedQuestions) * 100).toFixed(1);

    if (this.batchBar) {
      this.batchBar.update(totalInBatch, {
        status: `✓ ${correctInBatch}/${totalInBatch} correct`,
      });
    }

    if (this.overallBar) {
      this.overallBar.update(this.completedQuestions, {
        status: `Accuracy: ${accuracy}%`,
      });
    }
  }

  completeQuestion(isCorrect: boolean): void {
    // Increment in-batch progress (used for real-time updates)
    // The actual overall update happens in completeBatch
  }

  stop(): void {
    this.multiBar.stop();
    console.log("\n");
  }

  log(message: string): void {
    // Log below the progress bars
    this.multiBar.log(message + "\n");
  }
}

// Simple console-based progress for environments without TTY
export class SimpleProgressTracker {
  private totalQuestions: number = 0;
  private completedQuestions: number = 0;
  private correctCount: number = 0;

  start(totalQuestions: number, totalBatches: number): void {
    this.totalQuestions = totalQuestions;
    this.completedQuestions = 0;
    this.correctCount = 0;

    console.log("\n🚀 Starting UPSC Prelims Solver");
    console.log(`📝 Total Questions: ${totalQuestions}`);
    console.log(`📦 Batches: ${totalBatches}\n`);
  }

  startBatch(batchNumber: number, batchSize: number): void {
    console.log(`\n📦 Starting Batch ${batchNumber}...`);
  }

  updateBatchProgress(completed: number, batchSize: number): void {
    // Minimal updates for simple mode
  }

  completeBatch(batchNumber: number, correctInBatch: number, totalInBatch: number): void {
    this.completedQuestions += totalInBatch;
    this.correctCount += correctInBatch;

    const overallAccuracy = ((this.correctCount / this.completedQuestions) * 100).toFixed(1);
    const batchAccuracy = ((correctInBatch / totalInBatch) * 100).toFixed(1);

    console.log(`✅ Batch ${batchNumber} complete: ${correctInBatch}/${totalInBatch} correct (${batchAccuracy}%)`);
    console.log(`📊 Overall: ${this.completedQuestions}/${this.totalQuestions} questions, ${overallAccuracy}% accuracy`);
  }

  completeQuestion(isCorrect: boolean): void {
    // No-op for simple tracker
  }

  stop(): void {
    console.log("\n✨ All batches complete!\n");
  }

  log(message: string): void {
    console.log(message);
  }
}

// Factory function to create appropriate tracker
export function createProgressTracker(useSimple: boolean = false): ProgressTracker | SimpleProgressTracker {
  if (useSimple || !process.stdout.isTTY) {
    return new SimpleProgressTracker();
  }
  return new ProgressTracker();
}
