import { useTranslation } from 'react-i18next';

type HamsterLoaderProps = {
  className?: string;
};

export default function HamsterLoader({ className }: HamsterLoaderProps) {
  const { t } = useTranslation();
  const classes = className ? `hamster-loader ${className}` : 'hamster-loader';
  return (
    <div className={classes}>
      <div
        aria-label={t('common.loadingAnimation')}
        role="img"
        className="wheel-and-hamster"
      >
        <div className="wheel" />
        <div className="hamster">
          <div className="hamster__body">
            <div className="hamster__head">
              <div className="hamster__ear" />
              <div className="hamster__eye" />
              <div className="hamster__nose" />
            </div>
            <div className="hamster__limb hamster__limb--fr" />
            <div className="hamster__limb hamster__limb--fl" />
            <div className="hamster__limb hamster__limb--br" />
            <div className="hamster__limb hamster__limb--bl" />
            <div className="hamster__tail" />
          </div>
        </div>
        <div className="spoke" />
      </div>
    </div>
  );
}
