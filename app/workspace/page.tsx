"use client";

import { useRequireMe } from "@/lib/session";
import { WorkspaceView } from "./WorkspaceView";

export default function WorkspacePage() {
  const { me } = useRequireMe();
  return <WorkspaceView me={me} />;
}
