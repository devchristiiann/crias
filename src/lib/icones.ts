import {
  BookOpen,
  Brain,
  Droplet,
  Dumbbell,
  Heart,
  Moon,
  Target,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

const MAPA: Record<string, LucideIcon> = {
  target: Target,
  dumbbell: Dumbbell,
  'book-open': BookOpen,
  droplet: Droplet,
  moon: Moon,
  brain: Brain,
  heart: Heart,
  wallet: Wallet,
}

export function iconeDoHabito(nome: string): LucideIcon {
  return MAPA[nome] ?? Target
}
