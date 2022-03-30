xpi: clean
	zip -x /*.code-workspace  makefile Information.txt -r regimailAddOn.xpi *

clean:
	rm -f regimailAddOn.xpi
