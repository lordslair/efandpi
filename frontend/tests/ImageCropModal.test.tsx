// Pattern B — component test. react-easy-crop and the canvas cropping utility
// are mocked because jsdom has no real image decoding or canvas/toBlob support.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ImageCropModal from "../src/components/ImageCropModal";
import * as cropImageModule from "../src/utils/cropImage";

vi.mock("react-easy-crop", () => ({
  default: ({
    onCropComplete,
  }: {
    onCropComplete?: (area: unknown, areaPixels: unknown) => void;
  }) => (
    <button
      data-testid="mock-cropper"
      onClick={() =>
        onCropComplete?.(
          { x: 0, y: 0, width: 100, height: 100 },
          { x: 10, y: 10, width: 100, height: 100 }
        )
      }
    >
      Mock Cropper
    </button>
  ),
}));

vi.mock("../src/utils/cropImage");

const mockedCropImageToFile = vi.mocked(cropImageModule.cropImageToFile);

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:mock-image");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
});

function makeFile() {
  return new File(["fake-bytes"], "photo.jpg", { type: "image/jpeg" });
}

describe("ImageCropModal — rendering", () => {
  it("shows the Crop photo heading", () => {
    render(<ImageCropModal file={makeFile()} onCancel={vi.fn()} onComplete={vi.fn()} />);
    expect(screen.getByText("Crop photo")).toBeInTheDocument();
  });

  it("disables Use Photo until a crop area is available", () => {
    render(<ImageCropModal file={makeFile()} onCancel={vi.fn()} onComplete={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Use Photo" })).toBeDisabled();
  });
});

describe("ImageCropModal — skip", () => {
  it("calls onComplete with the original file and does not crop", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<ImageCropModal file={makeFile()} onCancel={vi.fn()} onComplete={onComplete} />);

    await user.click(screen.getByRole("button", { name: "Skip" }));

    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ name: "photo.jpg" })
    );
    expect(mockedCropImageToFile).not.toHaveBeenCalled();
  });
});

describe("ImageCropModal — cancel", () => {
  it("calls onCancel without calling onComplete", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onComplete = vi.fn();
    render(<ImageCropModal file={makeFile()} onCancel={onCancel} onComplete={onComplete} />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onComplete).not.toHaveBeenCalled();
  });
});

describe("ImageCropModal — use photo", () => {
  it("crops the image and calls onComplete with the cropped file once a crop area is set", async () => {
    const croppedFile = new File(["cropped"], "photo.jpg", { type: "image/jpeg" });
    mockedCropImageToFile.mockResolvedValue(croppedFile);
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(
      <ImageCropModal file={makeFile()} onCancel={vi.fn()} onComplete={onComplete} />
    );

    await user.click(screen.getByTestId("mock-cropper"));
    expect(screen.getByRole("button", { name: "Use Photo" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Use Photo" }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith(croppedFile));
    expect(mockedCropImageToFile).toHaveBeenCalledWith(
      "blob:mock-image",
      { x: 10, y: 10, width: 100, height: 100 },
      "photo.jpg",
      "image/jpeg"
    );
  });

  it("shows an error and re-enables Use Photo when cropping fails", async () => {
    mockedCropImageToFile.mockRejectedValue(new Error("Failed to crop image"));
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(
      <ImageCropModal file={makeFile()} onCancel={vi.fn()} onComplete={onComplete} />
    );

    await user.click(screen.getByTestId("mock-cropper"));
    await user.click(screen.getByRole("button", { name: "Use Photo" }));

    expect(await screen.findByText("Failed to crop image")).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Use Photo" })).toBeEnabled();
  });
});
