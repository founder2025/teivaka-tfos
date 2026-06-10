/**
 * ChatContext — the chat "brain" shared across the app.
 *  - dropdownOpen: the top-bar message dropdown (connections list) open state.
 *  - unread: total unread (single source: ChatWidget's connections poll writes it;
 *    the top-bar icon reads it).
 *  - conns: live connection list (presence/unread), written by ChatWidget's poll,
 *    read by the dropdown.
 *  - openChats: which conversations are floating (chat heads). openWith/closeChat
 *    mutate it; persisted to localStorage so they survive a reload.
 */
import { createContext, useContext, useEffect, useState } from "react";

const ChatContext = createContext(null);
const LS_OPEN = "tfos_open_chats";

function loadOpen() {
  try { return JSON.parse(localStorage.getItem(LS_OPEN) || "[]"); } catch { return []; }
}

export function ChatProvider({ children }) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [conns, setConns] = useState(null);
  const [openChats, setOpenChats] = useState(loadOpen); // [{user_id, full_name, profession}]

  useEffect(() => {
    try { localStorage.setItem(LS_OPEN, JSON.stringify(openChats.map((c) => ({ user_id: c.user_id, full_name: c.full_name, profession: c.profession })))); } catch { /* ignore */ }
  }, [openChats]);

  const openWith = (conn) =>
    setOpenChats((cur) => (cur.find((c) => c.user_id === conn.user_id) ? cur : [...cur, conn]));
  const closeChat = (id) => setOpenChats((cur) => cur.filter((c) => c.user_id !== id));

  return (
    <ChatContext.Provider value={{
      dropdownOpen, setDropdownOpen, toggleDropdown: () => setDropdownOpen((o) => !o),
      unread, setUnread, conns, setConns, openChats, openWith, closeChat,
    }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  return useContext(ChatContext) || {
    dropdownOpen: false, setDropdownOpen: () => {}, toggleDropdown: () => {},
    unread: 0, setUnread: () => {}, conns: null, setConns: () => {},
    openChats: [], openWith: () => {}, closeChat: () => {},
  };
}
