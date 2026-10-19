import { LazyMotion, MotionConfig } from "motion/react";

// Animation features are optional: the first screen renders before this chunk loads.
const loadFeatures = () => import("../utils/motionFeatures")
  .then(module => module.default)
  .catch(() => ({})); // Keep the interface usable when an optional chunk cannot load.

export default function AnimationProvider({ children }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.2 }}>
      <LazyMotion features={loadFeatures} strict>{children}</LazyMotion>
    </MotionConfig>
  );
}
