import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { WorkspaceSocket } from "./socket";

const SocketContext = createContext<WorkspaceSocket | null>(null);

export function WorkspaceProvider({ slug, children }: { slug: string; children: ReactNode }) {
  const [socket, setSocket] = useState<WorkspaceSocket | null>(null);
  useEffect(() => {
    const s = new WorkspaceSocket(slug);
    setSocket(s);
    return () => s.close();
  }, [slug]);
  return socket ? <SocketContext.Provider value={socket}>{children}</SocketContext.Provider> : null;
}

export function useSocket(): WorkspaceSocket {
  const socket = useContext(SocketContext);
  if (!socket) throw new Error("useSocket outside WorkspaceProvider");
  return socket;
}
