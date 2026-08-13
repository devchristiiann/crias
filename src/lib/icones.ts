import {
  BookOpen,
  Brain,
  Droplet,
  Droplets,
  Dumbbell,
  Heart,
  Moon,
  Smartphone,
  Sun,
  Sunrise,
  Target,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

// `sunrise` e `droplets` sao os nomes que `criar_habito` grava nos modulos, e o
// servidor e a fonte da verdade. `sun` e `droplet` ficam: a grade decorativa de
// escolha de icone usa os dois, e sumir com eles apagaria o icone de quem ja
// escolheu.
const MAPA: Record<string, LucideIcon> = {
  target: Target,
  dumbbell: Dumbbell,
  'book-open': BookOpen,
  droplet: Droplet,
  droplets: Droplets,
  moon: Moon,
  sun: Sun,
  sunrise: Sunrise,
  smartphone: Smartphone,
  brain: Brain,
  heart: Heart,
  wallet: Wallet,
}

export function iconeDoHabito(nome: string): LucideIcon {
  return MAPA[nome] ?? Target
}
