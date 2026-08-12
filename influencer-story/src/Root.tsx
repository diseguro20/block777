import "./index.css";
import { MyComposition } from "./Composition";
import { CreativeBonusComposition } from "./CreativeBonus";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <MyComposition />
      <CreativeBonusComposition />
    </>
  );
};
