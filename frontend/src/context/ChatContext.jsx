/**
 * ChatContext — shares chat open/close state + unread count between the top-bar
 * message icon (RightCluster) and the chat panel (ChatWidget). The unread count is
 * written by ChatWidget's single connections poll (one source) and read by the icon.
 */
import { createContext, useContext, useState } from "react";

const ChatContext = createContext(null);

export function ChatProvider({ children }) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  return (
    <ChatContext.Provider value={{ open, setOpen, toggle: () => setOpen((o) => !o), unread, setUnread }}>
      {children}
    </ChatContext.Provider>
  );
}

// Safe defaults so consumers never crash if rendered outside the provider.
export function useChat() {
  return useContext(ChatContext) || { open: false, setOpen: () => {}, toggle: () => {}, unread: 0, setUnread: () => {} };
}
