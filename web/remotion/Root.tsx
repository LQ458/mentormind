import { Composition, getInputProps } from 'remotion';
import { LessonVideo } from './scenes/LessonVideo';
import '../app/globals.css';

export const RemotionRoot: React.FC = () => {
  const inputProps = getInputProps();

  return (
    <>
      <Composition
        id="LessonVideo"
        component={LessonVideo}
        durationInFrames={Math.floor((inputProps.script?.total_duration || 60) * 30)}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={inputProps.script ? inputProps : {
          script: {
            title: "Example Lesson",
            total_duration: 10,
            scenes: [
              {
                id: "s1",
                duration: 5,
                narration: "Welcome to MentorMind",
                action: "show_title",
                param: "MentorMind AI"
              },
              {
                id: "s2",
                duration: 5,
                narration: "This is a programmatic video",
                action: "show_text",
                param: "Code-to-Video Engine"
              }
            ]
          }
        }}
      />
    </>
  );
};
