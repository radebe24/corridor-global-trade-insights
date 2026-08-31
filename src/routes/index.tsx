import { createFileRoute } from "@tanstack/react-router";

import { AskCorridor } from "@/components/corridor/AskCorridor";

const title = "Corridor — global trade and infrastructure intelligence";
const description =
  "Ask in plain language about tariffs, eligibility, trade and infrastructure flows, corridor and chokepoint exposure, and what-if scenarios. Any origin, any corridor. Every number carries its source.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return <AskCorridor />;
}
