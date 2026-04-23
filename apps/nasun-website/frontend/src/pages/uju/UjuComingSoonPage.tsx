import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ButtonV4 } from "@/components/ui/button-v4";
import { FadeInUp } from "@/components/ui/FadeInUp";
import { useAuth } from "@/features/auth/hooks/useAuth";

export default function UjuComingSoonPage() {
  const { isAuthenticated } = useAuth();

  const handleSignUpLogin = () => {
    localStorage.setItem("auth_return_to", "/my-account");
    window.dispatchEvent(new CustomEvent("nasun:open-login"));
  };

  return (
    <>
      <Helmet>
        <title>uju - Coming Soon - NASUN</title>
        <meta
          name="description"
          content="uju is an on-chain operating system for a user's digital life. Coming soon to the Nasun ecosystem."
        />
      </Helmet>

      <section className="relative min-h-[calc(100dvh-50px)] flex items-center justify-center overflow-hidden bg-nasun-black">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              "radial-gradient(ellipse at 50% 20%, rgba(94,225,228,0.18), transparent 60%), radial-gradient(ellipse at 50% 90%, rgba(134,243,183,0.12), transparent 55%)",
          }}
        />

        <div className="relative z-10 w-full max-w-3xl px-5 md:px-8 py-16 text-center">
          <FadeInUp>
            <h6 className="uppercase tracking-[0.35em] text-pado-3 mb-4">
              uju
            </h6>
            <h1 className="text-white !font-changeling font-bold tracking-widest uppercase text-4xl md:text-6xl mb-8">
              coming soon
            </h1>

            <p className="text-white/85 text-base md:text-lg leading-relaxed mx-auto max-w-2xl mb-10">
              uju is an on-chain operating system for a user's digital life.
              <br />
              Identity, reputation, assets, and daily participation all live in
              one place
              <br />
              and compound into a record that belongs entirely to the user.
              <br />
              Nothing resets between applications. Everything accumulates.
              <br />
              The Nasun L1, Pado, and every other component of the ecosystem
              <br />
              was built to demonstrate this working,
              <br />
              not as a vision, but as an operational proof-of-concept
              <br />
              with a live community generating verifiable on-chain behavioral
              data every day.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
              <Link to="/">
                <ButtonV4
                  color="ghost"
                  size="lg"
                  className="min-w-[180px] font-medium"
                >
                  Go to Home
                </ButtonV4>
              </Link>
              {isAuthenticated ? (
                <Link to="/my-account">
                  <ButtonV4
                    color="ghost"
                    size="lg"
                    className="min-w-[180px] font-medium text-white"
                  >
                    Go to Account
                  </ButtonV4>
                </Link>
              ) : (
                <ButtonV4
                  color="ghost"
                  size="lg"
                  onClick={handleSignUpLogin}
                  className="min-w-[180px] font-medium text-white"
                >
                  Sign Up / Login
                </ButtonV4>
              )}
            </div>
          </FadeInUp>
        </div>
      </section>
    </>
  );
}
