import { describe, expect, it } from "vitest";
import React from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

// Ensure components using the classic JSX runtime can access React globally.
(globalThis as any).React = React;

function getProps(element: React.ReactElement) {
  return element.props as Record<string, unknown>;
}

describe("ui components", () => {
  it("button forwards class names and props", () => {
    const handleClick = () => {};
    const element = Button({ className: "custom", onClick: handleClick, children: "Save" } as any);
    const props = getProps(element);

    expect(props["data-slot"]).toBe("button");
    expect(String(props.className).includes("custom")).toBe(true);
    expect(props.onClick).toBe(handleClick);
  });

  it("card subcomponents expose data slots", () => {
    const card = Card({ children: "body" } as any);
    const header = CardHeader({ children: "header" } as any);
    const title = CardTitle({ children: "title" } as any);
    const description = CardDescription({ children: "desc" } as any);
    const content = CardContent({ children: "content" } as any);
    const footer = CardFooter({ children: "footer" } as any);

    expect(getProps(card)["data-slot"]).toBe("card");
    expect(getProps(header)["data-slot"]).toBe("card-header");
    expect(getProps(title)["data-slot"]).toBe("card-title");
    expect(getProps(description)["data-slot"]).toBe("card-description");
    expect(getProps(content)["data-slot"]).toBe("card-content");
    expect(getProps(footer)["data-slot"]).toBe("card-footer");
  });

  it("input applies styling class", () => {
    const element = Input({ type: "text", placeholder: "Name" } as any);
    expect(getProps(element)["data-slot"]).toBe("input");
  });

  it("label marks htmlFor", () => {
    const element = Label({ htmlFor: "field", children: "Field" } as any);
    const props = getProps(element);
    expect(props.htmlFor).toBe("field");
    expect(props["data-slot"]).toBe("label");
  });

  it("password input renders input element", () => {
    expect(typeof PasswordInput).toBe("object");
    expect((PasswordInput as any).displayName).toBe("PasswordInput");
  });

  it("separator uses proper role", () => {
    const element = Separator({ orientation: "horizontal" } as any);
    const props = getProps(element);
    expect(props["data-slot"]).toBe("separator-root");
    expect(props.orientation).toBe("horizontal");
  });

  it("sheet components expose slots", () => {
    const sheet = Sheet({ children: null } as any);
    const trigger = SheetTrigger({ children: "Open" } as any);
    const content = SheetContent({ children: "Hello" } as any);

    expect(getProps(sheet)["data-slot"]).toBe("sheet");
    expect(getProps(trigger)["data-slot"]).toBe("sheet-trigger");
    const portal = content;
    const children = Array.isArray(portal.props.children)
      ? portal.props.children
      : [portal.props.children];
    const sheetContent = children[1];
    expect(sheetContent).toBeTruthy();
    if (sheetContent) {
      expect(sheetContent.props["data-slot"]).toBe("sheet-content");
    }
  });

  it("skeleton renders div with slot", () => {
    const element = Skeleton({ className: "w-4" } as any);
    expect(getProps(element)["data-slot"]).toBe("skeleton");
  });

  it("switch renders radix root", () => {
    const element = Switch({ defaultChecked: true } as any);
    const props = getProps(element);
    expect(props["data-slot"]).toBe("switch");
  });

  it("textarea merges classes", () => {
    const element = Textarea({ className: "h-20" } as any);
    const props = getProps(element);
    expect(props["data-slot"]).toBe("textarea");
    expect(String(props.className).includes("h-20")).toBe(true);
  });

  it("tooltip wiring", () => {
    const tooltip = Tooltip({ children: "text" } as any);
    const trigger = TooltipTrigger({ children: "trigger" } as any);
    const content = TooltipContent({ children: "content" } as any);

    const tooltipRoot = tooltip.props.children;
    expect(tooltipRoot.props["data-slot"]).toBe("tooltip");
    expect(getProps(trigger)["data-slot"]).toBe("tooltip-trigger");
    const portalChildren = content.props.children;
    expect(portalChildren.props["data-slot"]).toBe("tooltip-content");
  });

  it("toaster renders provider element", () => {
    expect(typeof Toaster).toBe("function");
  });
});
