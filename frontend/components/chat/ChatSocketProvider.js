"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { connectSocket } from "../../lib/chat";
import { getAccessToken } from "../../lib/auth";

/** One Socket.IO connection for the entire app session, not one per page.
 *
 * The room page used to create and tear down its own socket on every
 * mount/unmount, which meant every OTHER surface (the NavBar unread badge,
 * the /chat inbox) had no way to hear about a new message and had to poll.
 * Opening a second and third connection from those surfaces instead would
 * have meant 2–3 sockets per tab; a single shared one costs the same as the
 * one the room page already opened, and every consumer subscribes to it.
 *
 * `connected` is exposed so consumers can (a) fall back to REST polling
 * while it's false and (b) re-sync when it flips back to true — a socket
 * that dropped (laptop sleep, network blip) missed events while it was
 * down, so reconnecting is exactly when a refetch is required rather than
 * optional.
 */
const ChatSocketContext = createContext({ socket: null, connected: false });

export function useChatSocket() {
  return useContext(ChatSocketContext);
}

/**
 * Subscribes to one socket event for the lifetime of the calling component.
 * Kept here rather than making every consumer repeat the
 * on()/off()-in-a-cleanup dance — forgetting the off() would leak a handler
 * per mount onto a socket that outlives the page, which is exactly the
 * hazard a shared (rather than per-page) connection introduces.
 */
export function useChatSocketEvent(event, handler) {
  const { socket } = useChatSocket();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!socket) return undefined;
    const listener = (...args) => handlerRef.current?.(...args);
    socket.on(event, listener);
    return () => socket.off(event, listener);
  }, [socket, event]);
}

export default function ChatSocketProvider({ children }) {
  const [token, setToken] = useState(() => getAccessToken());
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  // Sync token from localStorage, auth change events, and window focus so the
  // socket automatically connects upon login without needing a manual page reload.
  useEffect(() => {
    function syncToken() {
      const currentToken = getAccessToken();
      setToken((prev) => (prev !== currentToken ? currentToken : prev));
    }

    syncToken();
    window.addEventListener("reloop:auth", syncToken);
    window.addEventListener("storage", syncToken);
    window.addEventListener("focus", syncToken);
    return () => {
      window.removeEventListener("reloop:auth", syncToken);
      window.removeEventListener("storage", syncToken);
      window.removeEventListener("focus", syncToken);
    };
  }, []);

  useEffect(() => {
    // Guests have nothing to subscribe to, and connecting without a token
    // would just be rejected by socketAuth.js on the server anyway.
    if (!token) {
      setSocket(null);
      setConnected(false);
      return undefined;
    }

    const instance = connectSocket(token);
    setSocket(instance);

    if (instance.connected) {
      setConnected(true);
    }

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    instance.on("connect", onConnect);
    instance.on("disconnect", onDisconnect);
    instance.on("connect_error", onDisconnect);

    return () => {
      instance.off("connect", onConnect);
      instance.off("disconnect", onDisconnect);
      instance.off("connect_error", onDisconnect);
      instance.close();
      setSocket(null);
      setConnected(false);
    };
  }, [token]);

  const value = useMemo(() => ({ socket, connected }), [socket, connected]);

  return (
    <ChatSocketContext.Provider value={value}>
      {children}
    </ChatSocketContext.Provider>
  );
}
