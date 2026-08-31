import { createFileRoute } from "@tanstack/react-router";

import { CorridorWorkspace } from "@/components/corridor/CorridorWorkspace";

const title = "Corridor workspace — tariff and trade risk";
const description =
  "Price the duty on your sourcing book, find the origins that cost less, and track the tariff and trade risk that threatens them. Public data, sourced on every figure.";

export const Route = createFileRoute("/workspace")({
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
  component: Workspace,
});

function Workspace() {
  return <CorridorWorkspace />;
}
