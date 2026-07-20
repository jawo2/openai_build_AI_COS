import { runManager } from "@/lib/agents/manager";
import { getMockProfile } from "@/lib/mockData";

const RUN_COUNT = 5;

async function main() {
  const profile = getMockProfile("tiktok");
  const results = [];

  for (let index = 0; index < RUN_COUNT; index += 1) {
    const result = await runManager(profile);
    results.push(result);

    console.log(`\n=== Manager Run ${index + 1}/${RUN_COUNT} ===`);
    console.log(JSON.stringify(result, null, 2));
  }

  console.log("\n=== Stability Summary ===");
  console.log(
    JSON.stringify(
      results.map((result, index) => ({
        run: index + 1,
        dataSource: result.dataSource,
        priorities: result.priorities.map((priority) => priority.title),
        recommendationTitles: result.recommendations.map(
          (recommendation) => recommendation.title
        ),
        actionTypes: result.recommendations.map((recommendation) => recommendation.actionType)
      })),
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
