import {
  executeActions,
  type ActionResult,
  type AgentAction,
} from "../composition-api/AgentActionHandler";
import type { CompositionAPI } from "../composition-api/CompositionAPI";

interface ChatMessage {
  role: "user" | "agent" | "system";
  text: string;
  results?: ActionResult[];
}

export class ChatSidebar {
  private element: HTMLDivElement;
  private messagesEl: HTMLDivElement;
  private inputEl: HTMLInputElement;
  private sendBtn: HTMLButtonElement;
  private statusEl: HTMLSpanElement;
  private visible = false;
  private api: CompositionAPI;
  private messages: ChatMessage[] = [];
  private sending = false;

  constructor(api: CompositionAPI) {
    this.api = api;

    const root = document.createElement("div");
    root.id = "chat-sidebar";
    root.innerHTML = this.buildHTML();
    document.body.appendChild(root);
    this.element = root;

    this.messagesEl = root.querySelector(".cs-messages") as HTMLDivElement;
    this.inputEl = root.querySelector(".cs-input") as HTMLInputElement;
    this.sendBtn = root.querySelector(".cs-send") as HTMLButtonElement;
    this.statusEl = root.querySelector(".cs-status") as HTMLSpanElement;

    this.bindEvents();
  }

  private buildHTML(): string {
    return `
      <div class="cs-header">
        <span class="cs-title">Vortex Agent</span>
        <button class="cs-close" data-action="close">✕</button>
      </div>
      <div class="cs-messages"></div>
      <div class="cs-input-bar">
        <input class="cs-input" type="text" placeholder="Describe a scene change...">
        <button class="cs-send">→</button>
      </div>
      <div class="cs-footer">
        <span class="cs-status">● disconnected</span>
        <span class="cs-project"></span>
      </div>
    `;
  }

  private bindEvents(): void {
    this.element
      .querySelector(".cs-close")!
      .addEventListener("click", () => this.hide());

    this.sendBtn.addEventListener("click", () => this.send());
    this.inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.send();
    });
  }

  private async send(): Promise<void> {
    const text = this.inputEl.value.trim();
    if (!text || this.sending) return;

    this.sending = true;
    this.inputEl.value = "";
    this.inputEl.disabled = true;
    this.sendBtn.disabled = true;

    this.addMessage({ role: "user", text });
    this.addMessage({ role: "system", text: "Thinking..." });
    this.setStatus("processing");

    try {
      const state = JSON.stringify(this.api.getState());
      const project = this.api.getCurrentProject();

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, project, state }),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      this.removeLastSystemMessage();

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let event = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            event = line.slice(7);
          } else if (line.startsWith("data: ") && event) {
            try {
              const data = JSON.parse(line.slice(6));
              this.handleSSEEvent(event, data);
            } catch {
              /* skip malformed */
            }
            event = "";
          }
        }
      }
    } catch (error) {
      this.removeLastSystemMessage();
      this.addMessage({
        role: "system",
        text: `Error: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      this.sending = false;
      this.inputEl.disabled = false;
      this.sendBtn.disabled = false;
      this.setStatus("connected");
      this.inputEl.focus();
    }
  }

  private handleSSEEvent(event: string, data: unknown): void {
    switch (event) {
      case "thinking":
        this.updateLastSystemMessage((data as { status: string }).status);
        break;

      case "actions": {
        const { actions, explanation } = data as {
          actions: AgentAction[];
          explanation: string;
        };

        this.removeLastSystemMessage();
        this.addMessage({ role: "agent", text: explanation });

        if (actions.length > 0) {
          executeActions(this.api, actions).then((results) => {
            const failures = results.filter((r) => !r.success);
            if (failures.length > 0) {
              this.addMessage({
                role: "system",
                text: `⚠ ${failures.length} action(s) failed: ${failures.map((f) => f.message).join(", ")}`,
                results,
              });
            } else {
              this.addMessage({
                role: "system",
                text: `✓ ${results.length} action(s) applied`,
                results,
              });
            }
          });
        }
        break;
      }

      case "error":
        this.removeLastSystemMessage();
        this.addMessage({
          role: "system",
          text: `Error: ${(data as { error: string }).error}`,
        });
        break;

      case "done":
        this.setStatus("connected");
        break;
    }
  }

  private addMessage(msg: ChatMessage): void {
    this.messages.push(msg);
    const el = document.createElement("div");
    el.className = `cs-msg cs-msg-${msg.role}`;
    el.textContent = msg.text;
    this.messagesEl.appendChild(el);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  private updateLastSystemMessage(text: string): void {
    const last = this.messagesEl.lastElementChild;
    if (last && last.classList.contains("cs-msg-system")) {
      last.textContent = text;
    }
  }

  private removeLastSystemMessage(): void {
    const last = this.messagesEl.lastElementChild;
    if (last && last.classList.contains("cs-msg-system")) {
      last.remove();
      this.messages.pop();
    }
  }

  private setStatus(status: string): void {
    this.statusEl.textContent = `● ${status}`;
    this.statusEl.className = `cs-status cs-status-${status}`;
  }

  public toggle(): void {
    if (this.visible) this.hide();
    else this.show();
  }

  public show(): void {
    this.visible = true;
    this.element.classList.add("open");
    this.setStatus("connected");
    this.inputEl.focus();
  }

  public hide(): void {
    this.visible = false;
    this.element.classList.remove("open");
  }

  public destroy(): void {
    this.element.remove();
  }
}
