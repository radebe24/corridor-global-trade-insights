import { createFileRoute, redirect } from "@tanstack/react-router";

/* The agent console used to live here, reached from a nav link while the
   workspace held the front door. It is now the front door itself. This route
   stays so that links and bookmarks pointing at /intel still land. */
export const Route = createFileRoute("/intel")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
});
