import { createElement } from "react";

type IconProps = React.SVGProps<SVGSVGElement>;

function createIcon(name: string) {
  return function Icon(props: IconProps) {
    return createElement("svg", {
      ...props,
      "data-icon": name,
    });
  };
}

const icons = new Proxy(
  {},
  {
    get: (_target, prop: string) => createIcon(prop),
  },
) as Record<string, ReturnType<typeof createIcon>>;

export const ArrowRight = icons.ArrowRight;
export const XIcon = icons.XIcon;
export const EyeIcon = icons.EyeIcon;
export const EyeOffIcon = icons.EyeOffIcon;
export const CheckIcon = icons.CheckIcon;
export const CopyIcon = icons.CopyIcon;
export const File = icons.File;
export const Image = icons.Image;
export const Undo2 = icons.Undo2;
export const ChevronRight = icons.ChevronRight;
export const X = icons.X;
export const ChevronsDownUp = icons.ChevronsDownUp;
export const ChevronsUpDown = icons.ChevronsUpDown;
export const Copy = icons.Copy;
export const CopyCheck = icons.CopyCheck;
export const ChevronDown = icons.ChevronDown;
export const ChevronUp = icons.ChevronUp;
export const PanelRightOpen = icons.PanelRightOpen;
export const PanelRightClose = icons.PanelRightClose;
export const SendHorizontal = icons.SendHorizontal;
export const RefreshCcw = icons.RefreshCcw;
export const Pencil = icons.Pencil;
export const ChevronLeft = icons.ChevronLeft;
export const ArrowDown = icons.ArrowDown;
export const LoaderCircle = icons.LoaderCircle;
export const SquarePen = icons.SquarePen;
export const Plus = icons.Plus;
export const ArrowUp = icons.ArrowUp;
export const Loader2 = icons.Loader2;
export const PanelLeftOpen = icons.PanelLeftOpen;
export const PanelLeftClose = icons.PanelLeftClose;
export const Play = icons.Play;
export const TerminalSquare = icons.TerminalSquare;
export const PanelRight = icons.PanelRight;
export const Trash = icons.Trash;
export const Ellipsis = icons.Ellipsis;
export const ExternalLink = icons.ExternalLink;
export const Info = icons.Info;
export const Minus = icons.Minus;
export const ArrowUpRight = icons.ArrowUpRight;
export const SquarePenIcon = icons.SquarePenIcon;
export const Settings = icons.Settings;
export const PanelLeft = icons.PanelLeft;
export const PanelRightCloseIcon = icons.PanelRightCloseIcon;
export const Download = icons.Download;

export { icons as default };
