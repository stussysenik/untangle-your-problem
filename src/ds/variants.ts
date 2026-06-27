import { cva } from 'class-variance-authority';

export const cardVariants = cva(
  // base
  'group transition-none cursor-pointer',
  {
    variants: {
      active: {
        true: '',
        false: '',
      },
    },
    defaultVariants: { active: false },
  },
);

export const dishNameVariants = cva(
  'font-sans font-black text-lg md:text-xl lg:text-2xl xl:text-3xl uppercase leading-none tracking-tight transition-colors duration-200',
  {
    variants: {
      active: {
        true: 'bg-insight text-black',
        false: 'text-black',
      },
    },
    defaultVariants: { active: false },
  },
);

export const buttonVariants = cva(
  'w-full py-6 lg:py-8 border-4 border-black transition-all duration-75 ease-out font-mono font-bold text-2xl lg:text-4xl uppercase group relative overflow-hidden active:scale-[0.99] flex items-center justify-center gap-4 lg:gap-6',
  {
    variants: {
      enabled: {
        true: 'bg-white text-black hover:bg-black hover:text-white hover:border-black',
        false: 'opacity-50 cursor-not-allowed bg-gray-50 text-gray-400 border-gray-200',
      },
    },
    defaultVariants: { enabled: true },
  },
);

export const noteVariants = cva(
  'select-none transition-shadow duration-200 origin-center self-start justify-self-start hover:shadow-2xl hover:scale-[1.01] active:scale-[1.02]',
  {
    variants: {
      noteType: {
        quote: 'max-w-sm lg:max-w-md p-4 lg:p-6 bg-[#fffdf5] border border-blue-200 shadow-xl text-blue-800',
        minimal: 'p-2 border-2 border-blue-700 text-blue-700 font-bold uppercase tracking-widest text-xs mix-blend-multiply opacity-80 rounded-sm',
        scribble: 'p-3 border border-gray-300 bg-white text-gray-700',
      },
    },
    defaultVariants: { noteType: 'quote' },
  },
);
