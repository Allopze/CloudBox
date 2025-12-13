import {
  Building2,
  Cloud,
  Cpu,
  FileText,
  FolderPlus,
  HardDrive,
  Home,
  Image as ImageIcon,
  LayoutGrid,
  Link as LinkIcon,
  Link2,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  Users,
  Video,
} from 'lucide-react';

export const LANDING_ICONS = {
  ShieldCheck,
  Sparkles,
  Link2,
  Users,
  UploadCloud,
  FolderPlus,
  FileText,
  LayoutGrid,
  Search,
  Image: ImageIcon,
  Link: LinkIcon,
  HardDrive,
  Server,
  Home,
  Building2,
  Video,
  Cpu,
  Cloud,
} as const;

export const getLandingIcon = (name: string) => {
  const Icon = (LANDING_ICONS as unknown as Record<string, any>)[name] ?? FileText;
  return Icon;
};

