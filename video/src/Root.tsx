import { Composition } from 'remotion';
import { ReformAd } from './ReformAd';

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="ReformAd"
      component={ReformAd}
      durationInFrames={750}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
