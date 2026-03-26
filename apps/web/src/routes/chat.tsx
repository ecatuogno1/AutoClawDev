import { createFileRoute } from "@tanstack/react-router";
import { Chat } from "@/components/Chat";

export const Route = createFileRoute("/chat")({
  component: ChatPage,
});

function ChatPage() {
  return (
    <div className="h-full flex flex-col">
      <Chat />
    </div>
  );
}
