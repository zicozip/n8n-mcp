import { writeFileSync } from 'fs';
import { resolve } from 'path';

export default class BenchmarkJsonReporter {
  constructor() {
    this.results = [];
  }

  onTaskUpdate(tasks) {
    // Called when tasks are updated
  }

  onFinished(files) {
    const results = {
      timestamp: new Date().toISOString(),
      files: []
    };

    for (const file of files || []) {
      if (!file) continue;
      
      const fileResult = {
        filepath: file.filepath || file.name,
        groups: []
      };

      // Process benchmarks
      if (file.tasks) {
        for (const task of file.tasks) {
          if (task.type === 'suite' && task.tasks) {
            const group = {
              name: task.name,
              benchmarks: []
            };

            for (const benchmark of task.tasks) {
              if (benchmark.result?.benchmark) {
                group.benchmarks.push({
                  name: benchmark.name,
                  result: {
                    mean: benchmark.result.benchmark.mean,
                    min: benchmark.result.benchmark.min,
                    max: benchmark.result.benchmark.max,
                    hz: benchmark.result.benchmark.hz,
                    p75: benchmark.result.benchmark.p75,
                    p99: benchmark.result.benchmark.p99,
                    p995: benchmark.result.benchmark.p995,
                    p999: benchmark.result.benchmark.p999,
                    rme: benchmark.result.benchmark.rme,
                    samples: benchmark.result.benchmark.samples
                  }
                });
              }
            }

            if (group.benchmarks.length > 0) {
              fileResult.groups.push(group);
            }
          }
        }
      }

      if (fileResult.groups.length > 0) {
        results.files.push(fileResult);
      }
    }

    // Write results
    const outputPath = resolve(process.cwd(), 'benchmark-results.json');
    writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log(`Benchmark results written to ${outputPath}`);
  }
}