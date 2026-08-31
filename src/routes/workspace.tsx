import { createFileRoute, redirect } from "@tanstack/react-router";

/* Corridor is Ask Corridor now. The legacy workspace surface is retired; this
   route stays so older links and bookmarks still land somewhere sensible. */
export const Route = createFileRoute("/workspace")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
});
