export const HomePage = () => {
  return (
    <div className="grid gap-2 p-4 text-justify">
      <h1 className="text-center text-2xl font-bold md:text-left">
        Welcome to Crackosaurus
      </h1>
      <p>
        Crackosaurus is the first open-source password recovery platform. The
        core system is powered by{" "}
        <a className="underline" href="https://hashcat.net/hashcat/">
          hashcat
        </a>
        , the world's fastest and most advanced password recovery tool. A novel
        approach is used to distribute the password recovery over multiple
        systems in a safe and secure way. Collaborate with your team to identify
        weak passwords in your organization.
      </p>
      <p>
        New user to Crackosaurus? Returning after not using the platform for a
        while? Looking for more information? Our core developer Alex will give
        you a quick tour of Crackosaurus:
      </p>
      <div className="flex justify-center">
        <iframe
          className="my-4 h-[135px] w-[240px] rounded-lg border sm:h-[180px] sm:w-[320px] md:h-[270px] md:w-[480px] lg:h-[540px] lg:w-[960px]"
          src="https://www.youtube.com/embed/z5OlO57livI"
          allowFullScreen
        />
      </div>
    </div>
  );
};
