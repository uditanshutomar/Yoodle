"use client";

import { motion, type Variants } from "framer-motion";

const draw: Variants = {
  hidden: { pathLength: 0, opacity: 0 },
  visible: {
    pathLength: 1,
    opacity: 1,
    transition: { pathLength: { duration: 1.2, ease: "easeInOut" as const }, opacity: { duration: 0.3 } },
  },
};

export function DoodleArrow({ className = "", direction = "right" }: { className?: string; direction?: "right" | "down" | "left" }) {
  const rotation = direction === "down" ? 90 : direction === "left" ? 180 : 0;
  return (
    <motion.svg
      className={className}
      width="80"
      height="40"
      viewBox="0 0 80 40"
      fill="none"
      style={{ rotate: rotation }}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-50px" }}
    >
      <motion.path
        d="M5 25C15 20 30 15 50 18C55 19 60 20 65 18"
        stroke="#1A1A1A"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
        variants={draw}
      />
      <motion.path
        d="M58 12L67 18L58 24"
        stroke="#1A1A1A"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        variants={draw}
      />
    </motion.svg>
  );
}

export function DoodleCircle({ className = "", color = "#FFE600" }: { className?: string; color?: string }) {
  return (
    <motion.svg
      className={className}
      width="60"
      height="60"
      viewBox="0 0 60 60"
      fill="none"
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-50px" }}
    >
      <motion.ellipse
        cx="30"
        cy="30"
        rx="24"
        ry="22"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
        variants={draw}
        style={{ rotate: -5 }}
      />
    </motion.svg>
  );
}

export function DoodleUnderline({ className = "", color = "#FFE600", width = 200 }: { className?: string; color?: string; width?: number }) {
  return (
    <motion.svg
      className={className}
      width={width}
      height="12"
      viewBox={`0 0 ${width} 12`}
      fill="none"
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-50px" }}
    >
      <motion.path
        d={`M2 8C${width * 0.15} 3 ${width * 0.35} 10 ${width * 0.5} 6C${width * 0.65} 2 ${width * 0.85} 9 ${width - 2} 5`}
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
        variants={draw}
      />
    </motion.svg>
  );
}

export function DoodleStar({ className = "", color = "#FFE600", size = 32 }: { className?: string; color?: string; size?: number }) {
  return (
    <motion.svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-50px" }}
    >
      <motion.path
        d="M16 2L18 12L28 10L20 16L28 22L18 20L16 30L14 20L4 22L12 16L4 10L14 12Z"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        variants={draw}
      />
    </motion.svg>
  );
}

export function DoodleSquiggle({ className = "" }: { className?: string }) {
  return (
    <motion.svg
      className={className}
      width="120"
      height="30"
      viewBox="0 0 120 30"
      fill="none"
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-50px" }}
    >
      <motion.path
        d="M3 15C13 5 23 25 33 15C43 5 53 25 63 15C73 5 83 25 93 15C103 5 113 25 117 15"
        stroke="#1A1A1A"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
        variants={draw}
      />
    </motion.svg>
  );
}

export function DoodleLightning({ className = "", color = "#FFE600" }: { className?: string; color?: string }) {
  return (
    <motion.svg
      className={className}
      width="28"
      height="40"
      viewBox="0 0 28 40"
      fill="none"
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-50px" }}
    >
      <motion.path
        d="M18 2L6 18H14L10 38L24 16H15L18 2Z"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        variants={draw}
      />
    </motion.svg>
  );
}

export function DoodleCheckmark({ className = "", color = "#1A1A1A" }: { className?: string; color?: string }) {
  return (
    <motion.svg
      className={className}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-50px" }}
    >
      <motion.path
        d="M4 12L10 18L20 6"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        variants={draw}
      />
    </motion.svg>
  );
}

export function DoodleSpeechBubble({ className = "" }: { className?: string }) {
  return (
    <motion.svg
      className={className}
      width="80"
      height="70"
      viewBox="0 0 80 70"
      fill="none"
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-50px" }}
    >
      <motion.path
        d="M10 10C10 6 14 3 20 3H60C66 3 70 6 70 10V40C70 44 66 47 60 47H30L15 60V47H20C14 47 10 44 10 40V10Z"
        stroke="#1A1A1A"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        variants={draw}
      />
    </motion.svg>
  );
}

export function DoodleSparkles({ className = "" }: { className?: string }) {
  return (
    <motion.svg
      className={className}
      width="40"
      height="40"
      viewBox="0 0 40 40"
      fill="none"
      initial={{ opacity: 0, scale: 0 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, type: "spring" }}
    >
      <path d="M20 4L22 16L34 14L24 20L34 26L22 24L20 36L18 24L6 26L16 20L6 14L18 16Z" fill="#FFE600" />
    </motion.svg>
  );
}

export function DoodleVideoCall({ className = "" }: { className?: string }) {
  return (
    <motion.svg
      className={className}
      width="400"
      height="320"
      viewBox="0 0 400 320"
      fill="none"
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-50px" }}
    >
      {/* Main screen */}
      <motion.rect x="30" y="20" width="340" height="220" rx="12" stroke="#1A1A1A" strokeWidth="3" fill="none" variants={draw} />

      {/* Person 1 - top left */}
      <motion.rect x="50" y="40" width="145" height="90" rx="8" stroke="#1A1A1A" strokeWidth="2" fill="none" variants={draw} />
      <motion.circle cx="122" cy="70" r="15" stroke="#1A1A1A" strokeWidth="2" fill="none" variants={draw} />
      <motion.path d="M100 105C100 95 110 88 122 88C134 88 144 95 144 105" stroke="#1A1A1A" strokeWidth="2" strokeLinecap="round" fill="none" variants={draw} />

      {/* Person 2 - top right */}
      <motion.rect x="205" y="40" width="145" height="90" rx="8" stroke="#1A1A1A" strokeWidth="2" fill="none" variants={draw} />
      <motion.circle cx="277" cy="70" r="15" stroke="#1A1A1A" strokeWidth="2" fill="none" variants={draw} />
      <motion.path d="M255 105C255 95 265 88 277 88C289 88 299 95 299 105" stroke="#1A1A1A" strokeWidth="2" strokeLinecap="round" fill="none" variants={draw} />

      {/* Person 3 - bottom left */}
      <motion.rect x="50" y="140" width="145" height="90" rx="8" stroke="#1A1A1A" strokeWidth="2" fill="none" variants={draw} />
      <motion.circle cx="122" cy="170" r="15" stroke="#1A1A1A" strokeWidth="2" fill="none" variants={draw} />
      <motion.path d="M100 205C100 195 110 188 122 188C134 188 144 195 144 205" stroke="#1A1A1A" strokeWidth="2" strokeLinecap="round" fill="none" variants={draw} />

      {/* Person 4 - bottom right (you) with yellow highlight */}
      <motion.rect x="205" y="140" width="145" height="90" rx="8" stroke="#FFE600" strokeWidth="3" fill="none" variants={draw} />
      <motion.circle cx="277" cy="170" r="15" stroke="#1A1A1A" strokeWidth="2" fill="none" variants={draw} />
      <motion.path d="M255 205C255 195 265 188 277 188C289 188 299 195 299 205" stroke="#1A1A1A" strokeWidth="2" strokeLinecap="round" fill="none" variants={draw} />

      {/* "YOU" label */}
      <motion.text x="267" y="225" fontSize="10" fontWeight="700" fill="#FFE600" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={{ delay: 1.2 }}>YOU</motion.text>

      {/* Bottom bar with controls */}
      <motion.rect x="130" y="255" width="140" height="35" rx="18" stroke="#1A1A1A" strokeWidth="2" fill="none" variants={draw} />

      {/* Mic icon */}
      <motion.circle cx="160" cy="272" r="8" stroke="#1A1A1A" strokeWidth="1.5" fill="none" variants={draw} />
      <motion.line x1="160" y1="266" x2="160" y2="278" stroke="#1A1A1A" strokeWidth="1.5" strokeLinecap="round" variants={draw} />

      {/* Camera icon */}
      <motion.rect x="190" y="265" width="16" height="12" rx="2" stroke="#1A1A1A" strokeWidth="1.5" fill="none" variants={draw} />
      <motion.path d="M206 268L214 264V280L206 276" stroke="#1A1A1A" strokeWidth="1.5" strokeLinecap="round" fill="none" variants={draw} />

      {/* End call - red */}
      <motion.rect x="235" y="265" width="24" height="14" rx="7" stroke="#FF6B6B" strokeWidth="2" fill="none" variants={draw} />

      {/* Floating doodle elements */}
      <motion.path d="M15 50L5 55L15 60" stroke="#FFE600" strokeWidth="2" strokeLinecap="round" fill="none" variants={draw} />
      <motion.circle cx="380" cy="100" r="5" fill="#FFE600" initial={{ opacity: 0, scale: 0 }} whileInView={{ opacity: 1, scale: 1 }} transition={{ delay: 1 }} />
      <motion.circle cx="20" cy="200" r="3" fill="#1A1A1A" initial={{ opacity: 0, scale: 0 }} whileInView={{ opacity: 1, scale: 1 }} transition={{ delay: 1.2 }} />

      {/* Chat bubble floating */}
      <motion.path
        d="M355 180C355 176 358 174 362 174H390C394 174 397 176 397 180V198C397 202 394 204 390 204H372L362 212V204H362C358 204 355 202 355 198V180Z"
        stroke="#1A1A1A"
        strokeWidth="1.5"
        fill="none"
        variants={draw}
      />
      <motion.text x="365" y="193" fontSize="8" fill="#1A1A1A" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={{ delay: 1.5 }}>lol nice</motion.text>

      {/* AI sparkle */}
      <motion.path
        d="M370 50L372 56L378 54L374 58L378 62L372 60L370 66L368 60L362 62L366 58L362 54L368 56Z"
        fill="#FFE600"
        initial={{ opacity: 0, scale: 0, rotate: 0 }}
        whileInView={{ opacity: 1, scale: 1, rotate: 360 }}
        transition={{ delay: 0.8, duration: 0.6 }}
      />
    </motion.svg>
  );
}
