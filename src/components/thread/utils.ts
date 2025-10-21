import type { Message } from "@langchain/langgraph-sdk";

/**
 * Extracts a string summary from a message's content, supporting multimodal (text, image, file, etc.).
 * - If text is present, returns the joined text.
 * - If not, returns a label for the first non-text modality (e.g., 'Image', 'Other').
 * - If unknown, returns 'Multimodal message'.
 */
export function getContentString(content: Message["content"]): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) {
    return "Multimodal message";
  }

  if (content.length === 0) {
    return "";
  }

  const textBlocks = content
    .filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text.trim())
    .filter((text) => text.length > 0);

  if (textBlocks.length > 0) {
    return textBlocks.join(" ");
  }

  const firstNonText = content.find((c) => c.type !== "text");
  if (firstNonText && typeof firstNonText === "object") {
    const typeValue = (firstNonText as { type?: unknown }).type;
    if (typeof typeValue === "string") {
      const labels: Record<string, string> = {
        image: "Image",
        file: "File",
        audio: "Audio",
        video: "Video",
      };
      return labels[typeValue] ?? "Other";
    }
  }

  return "Multimodal message";
}
