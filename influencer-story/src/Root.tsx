import "./index.css";
import { MyComposition } from "./Composition";
import { CreativeBonusComposition } from "./CreativeBonus";
import { PartnerPitchComposition } from "./PartnerPitch";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <MyComposition />
      <CreativeBonusComposition />
      <PartnerPitchComposition />
    </>
  );
};
